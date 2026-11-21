import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM encryption for sensitive values at rest (e.g. IBANs).
 * Key: DATA_ENCRYPTION_KEY (32 bytes, base64 or hex). Without it (development), a key is derived
 * from FILE_SIGNING_SECRET. Production must set DATA_ENCRYPTION_KEY and keep it stable.
 */
function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw) {
    const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (k.length === 32) return k;
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)');
  }
  return createHash('sha256').update(`unret-data:${process.env.FILE_SIGNING_SECRET ?? 'dev'}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decrypt(token: string): string {
  const [v, iv, tag, data] = token.split(':');
  if (v !== 'v1') throw new Error('Unknown encryption format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
