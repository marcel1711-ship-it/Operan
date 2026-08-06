import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || '';
const OAUTH_STATE_SECRET = process.env.INTEGRATION_ENCRYPTION_KEY || 'oauth-state-dev-key-change-me';

// Use a 32-byte key derived from the env var
function getKey(): Buffer {
  const key = ENCRYPTION_KEY || 'default-dev-key-change-in-production-32b';
  // Hash to exactly 32 bytes
  return createHmac('sha256', key).digest();
}

export function encrypt(data: string): Buffer {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Prepend IV and append auth tag: [IV (16)] [encrypted] [authTag (16)]
  return Buffer.concat([iv, encrypted, authTag]);
}

export function decrypt(encryptedBuffer: Buffer): string {
  const key = getKey();
  if (encryptedBuffer.length < 32) throw new Error('Invalid encrypted data');
  const iv = encryptedBuffer.subarray(0, 16);
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const encrypted = encryptedBuffer.subarray(16, encryptedBuffer.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function createOAuthState(tenantId: string): string {
  const ts = Date.now();
  const payload = `${tenantId}:${ts}`;
  const signature = createHmac('sha256', OAUTH_STATE_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

export function verifyOAuthState(state: string, maxAgeMs: number = 10 * 60 * 1000): { tenantId: string; valid: boolean } {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return { tenantId: '', valid: false };
    const [tenantId, tsStr, signature] = parts;
    const ts = parseInt(tsStr, 10);

    // Check expiry
    if (Date.now() - ts > maxAgeMs) return { tenantId, valid: false };

    // Verify signature
    const payload = `${tenantId}:${ts}`;
    const expectedSig = createHmac('sha256', OAUTH_STATE_SECRET).update(payload).digest('hex');

    // Timing-safe comparison
    if (signature.length !== expectedSig.length) return { tenantId, valid: false };
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (!sigBuf.equals(expBuf)) return { tenantId, valid: false };

    return { tenantId, valid: true };
  } catch {
    return { tenantId: '', valid: false };
  }
}
