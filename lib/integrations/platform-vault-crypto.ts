// Platform Secrets Vault — AES-256-GCM encryption module.
// Server-only. NEVER import from client code.
// Uses PLATFORM_SECRETS_MASTER_KEY as the root encryption secret.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const CURRENT_VERSION = 1;

function getMasterKey(): Buffer {
  const raw = process.env.PLATFORM_SECRETS_MASTER_KEY;
  if (!raw || raw.trim() === '') {
    throw new Error('PLATFORM_SECRETS_MASTER_KEY is not set. Generate a 32-byte hex string (openssl rand -hex 32) and set it as an environment variable.');
  }
  // Derive a 32-byte key via HMAC-SHA256 so any-length input works
  return createHmac('sha256', raw).digest();
}

export type EncryptedPayload = {
  encryptedValue: Buffer;
  iv: Buffer;
  authTag: Buffer;
  version: number;
};

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = randomBytes(12); // 12-byte IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encryptedValue: encrypted, iv, authTag, version: CURRENT_VERSION };
}

export function decryptSecret(encryptedValue: Buffer, iv: Buffer, authTag: Buffer): string {
  const key = getMasterKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedValue), decipher.final()]).toString('utf8');
}

export function maskSecret(plaintext: string): string {
  if (!plaintext || plaintext.length <= 4) return '••••';
  return '••••••••' + plaintext.slice(-4);
}

export function lastFour(plaintext: string): string {
  if (!plaintext || plaintext.length < 4) return plaintext || '';
  return plaintext.slice(-4);
}
