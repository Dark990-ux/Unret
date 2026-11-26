import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export type FilePurpose = 'avatar' | 'portfolio' | 'request' | 'message' | 'verification' | 'logo' | 'support';

const ALLOWED_MIME: Record<FilePurpose, string[]> = {
  avatar: ['image/jpeg', 'image/png', 'image/webp'],
  logo: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  portfolio: ['image/jpeg', 'image/png', 'image/webp'],
  request: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  message: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  verification: ['image/jpeg', 'image/png', 'application/pdf'],
  support: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};
const MAX_BYTES = 10 * 1024 * 1024;

/** Files that may be shown to anyone (still served via signed URLs, with a long TTL). */
const PUBLIC_PURPOSES: FilePurpose[] = ['avatar', 'logo', 'portfolio'];

/**
 * S3-compatible storage abstraction. The local-disk driver is used in development;
 * in production replace `put`/`read` with an S3 client and return presigned URLs.
 * Every download URL is signed and time-limited; personal documents are never public.
 */
@Injectable()
export class StorageService {
  private dir: string;
  private secret: string;
  private baseUrl: string;

  constructor(config: ConfigService) {
    this.dir = path.resolve(config.get('STORAGE_DIR') ?? './uploads');
    this.secret = config.getOrThrow('FILE_SIGNING_SECRET');
    this.baseUrl = config.get('PUBLIC_API_URL') ?? 'http://localhost:4000';
  }

  async put(ownerId: string, purpose: FilePurpose, file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!ALLOWED_MIME[purpose]) throw new BadRequestException('Unknown upload purpose');
    if (!ALLOWED_MIME[purpose].includes(file.mimetype)) throw new BadRequestException(`File type ${file.mimetype} not allowed`);
    if (file.size > MAX_BYTES) throw new BadRequestException('File too large (max 10 MB)');
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    const key = `${purpose}/${ownerId}/${randomUUID()}${ext}`;
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.buffer);
    await fs.writeFile(full + '.meta', JSON.stringify({ mime: file.mimetype, name: file.originalname }));
    return { key, name: file.originalname, mime: file.mimetype };
  }

  /** Ensures a key was uploaded by `ownerId` for the expected purpose before attaching it to a record. */
  assertOwned(key: string, ownerId: string, purpose: FilePurpose) {
    const [p, owner] = key.split('/');
    if (p !== purpose || owner !== ownerId || key.includes('..')) {
      throw new BadRequestException('Invalid file reference');
    }
  }

  signedUrl(key: string | null | undefined, ttlSeconds?: number): string | null {
    if (!key) return null;
    const purpose = key.split('/')[0] as FilePurpose;
    const ttl = ttlSeconds ?? (PUBLIC_PURPOSES.includes(purpose) ? 7 * 24 * 3600 : 10 * 60);
    // Round expiry so URLs are cache-friendly for public assets.
    const exp = Math.ceil((Date.now() / 1000 + ttl) / 600) * 600;
    const sig = this.sign(key, exp);
    return `${this.baseUrl}/api/v1/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`;
  }

  async read(key: string, exp: number, sig: string) {
    if (!exp || exp < Date.now() / 1000) throw new NotFoundException('Link expired');
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new NotFoundException();
    const full = this.resolve(key);
    try {
      const [data, meta] = await Promise.all([fs.readFile(full), fs.readFile(full + '.meta', 'utf8')]);
      return { data, ...(JSON.parse(meta) as { mime: string; name: string }) };
    } catch {
      throw new NotFoundException();
    }
  }

  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true });
    await fs.rm(this.resolve(key) + '.meta', { force: true });
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', this.secret).update(`${key}:${exp}`).digest('base64url');
  }

  private resolve(key: string) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(this.dir + path.sep)) throw new BadRequestException('Invalid key');
    return full;
  }
}
