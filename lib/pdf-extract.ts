export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const text = item.str.trim();
      if (!text) continue;

      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 8) {
        lines.push('\n');
      }
      lines.push(text);
      lastY = y;
    }

    pages.push(lines.join(' ').replace(/ \n /g, '\n').replace(/\n{3,}/g, '\n\n'));
  }

  return pages.join('\n\n---\n\n');
}

const FILL_PATTERNS: [RegExp, string][] = [
  [/_{3,}\s*\(?\s*(?:full\s*name|nombre|name\s*of\s*guest|print\s*name|guest\s*name|renter'?s?\s*name|client\s*name|passenger\s*name)\s*\)?/i, '{{signer_name}}'],
  [/_{3,}\s*\(?\s*(?:first\s*name|primer\s*nombre)\s*\)?/i, '{{first_name}}'],
  [/_{3,}\s*\(?\s*(?:last\s*name|apellido)\s*\)?/i, '{{last_name}}'],
  [/_{3,}\s*\(?\s*(?:e-?mail|correo)\s*\)?/i, '{{email}}'],
  [/_{3,}\s*\(?\s*(?:phone|tel[eé]fono|mobile|cell)\s*\)?/i, '{{phone}}'],
  [/_{3,}\s*\(?\s*(?:date|fecha)\s*\)?/i, '{{today}}'],
  [/_{3,}\s*\(?\s*(?:signature|firma)\s*\)?/i, '{{signature}}'],
  [/_{3,}\s*\(?\s*(?:address|direcci[oó]n)\s*\)?/i, '{{address}}'],
  [/_{3,}\s*\(?\s*(?:vessel|boat|embarcaci[oó]n|barco)\s*\)?/i, '{{vessel_name}}'],
  [/_{3,}\s*\(?\s*(?:booking|reservation|reserva)\s*#?\s*\)?/i, '{{booking_reference}}'],
];

const GENERIC_FILL = /_{4,}|-{6,}|\.{6,}/g;

function replaceBlankLines(line: string): string {
  for (const [pattern, variable] of FILL_PATTERNS) {
    if (pattern.test(line)) {
      return line.replace(pattern, `<strong>${variable}</strong>`);
    }
  }
  return line.replace(GENERIC_FILL, '<strong>{{_________}}</strong>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const SECTION_HEADING = /^(?:(?:section\s+)?\d{1,2}[\.\)\-]\s*|(?:article|section|part)\s+\w+[\.\:\-]\s*)/i;
const NUMBERED_ITEM = /^(?:\d{1,2}[\.\)]\s+|[a-z][\.\)]\s+|[ivxIVX]+[\.\)]\s+|•\s*|[-–—]\s+)/;
const ALL_CAPS_HEADING = /^[A-Z][A-Z\s\d&,\-:]{4,}$/;

export function textToHtml(text: string): string {
  const rawLines = text.split('\n');
  const html: string[] = [];
  let inList = false;
  let listType: 'ol' | 'ul' = 'ul';
  let currentSection = false;

  function closeList() {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
  }

  function closeSection() {
    if (currentSection) {
      closeList();
      html.push('</section>');
      currentSection = false;
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].trim();
    if (!raw) continue;

    if (raw === '---') {
      closeList();
      closeSection();
      html.push('<hr />');
      continue;
    }

    const escaped = escapeHtml(raw);
    const processed = replaceBlankLines(escaped);

    if (SECTION_HEADING.test(raw) || (ALL_CAPS_HEADING.test(raw) && raw.length < 80)) {
      closeSection();
      currentSection = true;
      html.push('<section>');
      html.push(`<h2>${processed}</h2>`);
      continue;
    }

    const isShortTitle = raw.length < 55 && !raw.includes('. ') && !NUMBERED_ITEM.test(raw)
      && !/[.,:;]$/.test(raw) && !raw.startsWith('(') && !/_{3,}|[-]{6,}/.test(raw);

    if (isShortTitle && !inList) {
      const nextLine = rawLines[i + 1]?.trim() || '';
      const nextIsContent = nextLine.length > 55 || NUMBERED_ITEM.test(nextLine) || SECTION_HEADING.test(nextLine);
      if (nextIsContent || !nextLine) {
        closeSection();
        currentSection = true;
        html.push('<section>');
        html.push(`<h2>${processed}</h2>`);
        continue;
      }
    }

    if (NUMBERED_ITEM.test(raw)) {
      const isOrdered = /^\d{1,2}[\.\)]/.test(raw) || /^[a-z][\.\)]/.test(raw) || /^[ivxIVX]+[\.\)]/.test(raw);
      const newListType = isOrdered ? 'ol' : 'ul';

      if (!inList || listType !== newListType) {
        closeList();
        listType = newListType;
        const typeAttr = /^[a-z][\.\)]/.test(raw) ? ' type="a"' : '';
        html.push(`<${listType}${typeAttr}>`);
        inList = true;
      }

      const content = raw.replace(/^(?:\d{1,2}[\.\)]\s*|[a-z][\.\)]\s*|[ivxIVX]+[\.\)]\s*|•\s*|[-–—]\s+)/, '');
      const escapedContent = escapeHtml(content);
      html.push(`<li>${replaceBlankLines(escapedContent)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${processed}</p>`);
  }

  closeList();
  closeSection();

  return html.join('\n');
}
