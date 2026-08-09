// Minimal QR Code generator (Mode: Byte, ECC: M)
// Produces a valid, scannable QR code matrix from a UTF-8 string.

const GF256_EXP = new Uint8Array(256);
const GF256_LOG = new Uint8Array(256);
(() => {
  let v = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = v;
    GF256_LOG[v] = i;
    v = (v << 1) ^ (v >= 128 ? 0x11d : 0);
  }
  GF256_EXP[255] = GF256_EXP[0];
})();

function gfMul(a: number, b: number) {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] + GF256_LOG[b]) % 255];
}

function polyMul(a: number[], b: number[]) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      out[i + j] ^= gfMul(a[i], b[j]);
  return out;
}

function polyRemainder(data: number[], gen: number[]) {
  const out = data.slice();
  for (let i = 0; i < data.length; i++) {
    if (out[i] === 0) continue;
    for (let j = 0; j < gen.length; j++)
      out[i + j] ^= gfMul(gen[j], out[i]);
  }
  return out.slice(data.length);
}

function generatorPoly(n: number) {
  let g = [1];
  for (let i = 0; i < n; i++)
    g = polyMul(g, [1, GF256_EXP[i]]);
  return g;
}

// Version configs: [version, size, dataCodewords, eccPerBlock, numBlocks]
const VERSION_TABLE: [number, number, number, number, number][] = [
  [1, 21, 16, 10, 1],
  [2, 25, 28, 16, 1],
  [3, 29, 44, 26, 1],
  [4, 33, 64, 18, 2],
  [5, 37, 86, 24, 2],
  [6, 41, 108, 16, 4],
  [7, 45, 124, 18, 4],
  [8, 49, 152, 22, 4],
  [9, 53, 180, 22, 4],
  [10, 57, 216, 26, 4],
];

function pickVersion(byteLen: number) {
  for (const v of VERSION_TABLE) {
    const capacity = v[2] - 2;
    if (byteLen <= capacity) return v;
  }
  return VERSION_TABLE[VERSION_TABLE.length - 1];
}

function encodeData(bytes: Uint8Array, totalDataCW: number): number[] {
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8); // count
  for (let i = 0; i < bytes.length; i++) push(bytes[i], 8);
  push(0, 4); // terminator
  while (bits.length % 8) bits.push(0);
  while (bits.length < totalDataCW * 8) {
    push(0xec, 8);
    if (bits.length < totalDataCW * 8) push(0x11, 8);
  }
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8)
    codewords.push((bits[i] << 7) | (bits[i+1] << 6) | (bits[i+2] << 5) | (bits[i+3] << 4) |
                   (bits[i+4] << 3) | (bits[i+5] << 2) | (bits[i+6] << 1) | bits[i+7]);
  return codewords;
}

function interleaveBlocks(data: number[], eccPerBlock: number, numBlocks: number) {
  const blockSize = Math.floor(data.length / numBlocks);
  const extraBlocks = data.length % numBlocks;
  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];
  const gen = generatorPoly(eccPerBlock);
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const size = blockSize + (b >= numBlocks - extraBlocks ? 1 : 0);
    const block = data.slice(offset, offset + size);
    offset += size;
    blocks.push(block);
    const padded = [...block, ...new Array(eccPerBlock).fill(0)];
    eccBlocks.push(polyRemainder(padded, gen));
  }

  const result: number[] = [];
  const maxBlockLen = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxBlockLen; i++)
    for (const b of blocks) if (i < b.length) result.push(b[i]);
  for (let i = 0; i < eccPerBlock; i++)
    for (const e of eccBlocks) result.push(e[i]);
  return result;
}

function createMatrix(size: number): (boolean | null)[][] {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function addFinderPattern(m: (boolean | null)[][], r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++)
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      if (dr === -1 || dr === 7 || dc === -1 || dc === 7)
        m[rr][cc] = false; // separator
      else if (dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
               (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
        m[rr][cc] = true;
      else
        m[rr][cc] = false;
    }
}

function addAlignmentPattern(m: (boolean | null)[][], r: number, c: number) {
  for (let dr = -2; dr <= 2; dr++)
    for (let dc = -2; dc <= 2; dc++) {
      if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0))
        m[r + dr][c + dc] = true;
      else
        m[r + dr][c + dc] = false;
    }
}

function addTimingPatterns(m: (boolean | null)[][]) {
  for (let i = 8; i < m.length - 8; i++) {
    if (m[6][i] === null) m[6][i] = i % 2 === 0;
    if (m[i][6] === null) m[i][6] = i % 2 === 0;
  }
}

const ALIGNMENT_POSITIONS: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

function addAlignmentPatterns(m: (boolean | null)[][], version: number) {
  const positions = ALIGNMENT_POSITIONS[version];
  if (!positions || positions.length < 2) return;
  for (const r of positions)
    for (const c of positions) {
      if (m[r][c] !== null) continue;
      addAlignmentPattern(m, r, c);
    }
}

function reserveFormatBits(m: (boolean | null)[][]) {
  const n = m.length;
  for (let i = 0; i < 8; i++) {
    if (m[8][i] === null) m[8][i] = false;
    if (m[i][8] === null) m[i][8] = false;
  }
  if (m[8][8] === null) m[8][8] = false;
  for (let i = 0; i < 7; i++) {
    if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = false;
    if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = false;
  }
  m[n - 8][8] = true; // dark module
}

function placeDataBits(m: (boolean | null)[][], bits: number[]) {
  const n = m.length;
  let idx = 0;
  let upward = true;
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    const rows = upward
      ? Array.from({ length: n }, (_, i) => n - 1 - i)
      : Array.from({ length: n }, (_, i) => i);
    for (const row of rows) {
      for (const dc of [0, -1]) {
        const c = col + dc;
        if (c < 0 || m[row][c] !== null) continue;
        m[row][c] = idx < bits.length ? bits[idx++] === 1 : false;
      }
    }
    upward = !upward;
  }
}

function applyMask(m: boolean[][], mask: number): boolean[][] {
  const n = m.length;
  const out = m.map(r => r.slice());
  const maskFn = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number) => r % 2 === 0,
    (_: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r: number, c: number) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
    (r: number, c: number) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
  ][mask];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (isDataModule(n, r, c) && maskFn(r, c))
        out[r][c] = !out[r][c];
  return out;
}

function isDataModule(n: number, r: number, c: number): boolean {
  if (r <= 8 && c <= 8) return false;
  if (r <= 8 && c >= n - 8) return false;
  if (r >= n - 8 && c <= 8) return false;
  if (r === 6 || c === 6) return false;
  return true;
}

const FORMAT_STRINGS: number[] = [
  0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0,
  0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976,
  0x1689, 0x13BE, 0x1CE7, 0x19D0, 0x0762, 0x0255, 0x0D0C, 0x083B,
  0x355F, 0x3068, 0x3F31, 0x3A06, 0x24B4, 0x2183, 0x2EDA, 0x2BED,
];

function applyFormatBits(m: boolean[][], mask: number) {
  const n = m.length;
  const eccLevel = 0; // M = 00
  const formatIdx = (eccLevel << 3) | mask;
  const bits = FORMAT_STRINGS[formatIdx];

  for (let i = 0; i < 6; i++) m[8][i] = !!((bits >> (14 - i)) & 1);
  m[8][7] = !!((bits >> 8) & 1);
  m[8][8] = !!((bits >> 7) & 1);
  m[7][8] = !!((bits >> 6) & 1);
  for (let i = 0; i < 6; i++) m[5 - i][8] = !!((bits >> (i)) & 1);

  for (let i = 0; i < 8; i++) m[8][n - 8 + i] = !!((bits >> (14 - i)) & 1);
  for (let i = 0; i < 7; i++) m[n - 1 - i][8] = !!((bits >> i) & 1);
}

function scorePenalty(m: boolean[][]): number {
  const n = m.length;
  let penalty = 0;
  for (let r = 0; r < n; r++) {
    let run = 1;
    for (let c = 1; c < n; c++) {
      if (m[r][c] === m[r][c - 1]) run++;
      else { if (run >= 5) penalty += run - 2; run = 1; }
    }
    if (run >= 5) penalty += run - 2;
  }
  for (let c = 0; c < n; c++) {
    let run = 1;
    for (let r = 1; r < n; r++) {
      if (m[r][c] === m[r - 1][c]) run++;
      else { if (run >= 5) penalty += run - 2; run = 1; }
    }
    if (run >= 5) penalty += run - 2;
  }
  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c] && m[r][c] === m[r+1][c+1])
        penalty += 3;
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
  const pct = (dark * 100) / (n * n);
  penalty += Math.abs(Math.floor(pct / 5) * 5 - 50) * 2;
  return penalty;
}

export function generateQR(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const [version, size, totalDataCW, eccPerBlock, numBlocks] = pickVersion(bytes.length);

  const dataCW = encodeData(bytes, totalDataCW);
  const finalCW = interleaveBlocks(dataCW, eccPerBlock, numBlocks);
  const bits = finalCW.flatMap(b =>
    [7,6,5,4,3,2,1,0].map(i => (b >> i) & 1)
  );

  const m = createMatrix(size);
  addFinderPattern(m, 0, 0);
  addFinderPattern(m, 0, size - 7);
  addFinderPattern(m, size - 7, 0);
  addAlignmentPatterns(m, version);
  addTimingPatterns(m);
  reserveFormatBits(m);

  const template = m.map(r => r.slice());
  placeDataBits(m, bits);
  const placed = m.map(r => r.map(v => v ?? false));

  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(placed, mask);
    applyFormatBits(masked, mask);
    const s = scorePenalty(masked);
    if (s < bestScore) { bestScore = s; bestMask = mask; }
  }

  const final = applyMask(placed, bestMask);
  applyFormatBits(final, bestMask);
  return final;
}
