import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const logger = new Logger('Storage');

/** Only real images; the extension comes from the verified MIME type, never the client's filename. */
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** First bytes of each allowed format, so a renamed .exe/.html with an image MIME type is rejected. */
function looksLikeImage(mime: string, b: Buffer): boolean {
  if (mime === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}

/**
 * Object storage (Cloudflare R2, AWS S3 or any S3-compatible bucket) is used when these are all set:
 *   S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL
 * plus S3_ENDPOINT for R2 (https://<account-id>.r2.cloudflarestorage.com) and optional S3_REGION (default "auto").
 * Without them files go to ./uploads on local disk, which is wiped on every Railway deploy.
 * Automated tests always use local disk so they can never touch a real bucket.
 */
function bucketConfig() {
  if (process.env.NODE_ENV === 'test') return null;
  const { S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_PUBLIC_URL) return null;
  return {
    bucket: S3_BUCKET,
    publicUrl: S3_PUBLIC_URL.replace(/\/+$/, ''),
    client: new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: !!process.env.S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    }),
  };
}

let cached: ReturnType<typeof bucketConfig> | undefined;
const storage = () => (cached === undefined ? (cached = bucketConfig()) : cached);

export const usingObjectStorage = () => !!storage();

/** Multer options for an image upload (5 MB, JPEG/PNG/WebP). The file is held in memory, then saved by saveImage(). */
export function imageUploadOptions() {
  return {
    storage: memoryStorage(),
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!IMAGE_EXT[file.mimetype]) {
        return cb(new BadRequestException('Only JPEG, PNG or WebP images are allowed.'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  };
}

/** Saves an uploaded image under <subdir>/ with a random name and returns its public URL. */
export async function saveImage(req: any, subdir: string, file: { buffer: Buffer; mimetype: string }): Promise<string> {
  if (!looksLikeImage(file.mimetype, file.buffer)) {
    throw new BadRequestException('That file is not a valid image.');
  }
  const name = `${randomUUID()}.${IMAGE_EXT[file.mimetype]}`;
  const key = `${subdir}/${name}`;
  const s = storage();

  if (s) {
    try {
      await s.client.send(
        new PutObjectCommand({
          Bucket: s.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          CacheControl: 'public, max-age=31536000, immutable', // names are random, so a file never changes
        }),
      );
    } catch (err: any) {
      logger.error(`Upload to object storage failed: ${err?.message}`);
      throw new ServiceUnavailableException('Could not store the image right now. Please try again.');
    }
    return `${s.publicUrl}/${key}`;
  }

  const dir = join(process.cwd(), 'uploads', subdir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), file.buffer);
  return `${req.protocol}://${req.get('host')}/uploads/${key}`;
}

/** Best-effort removal of an image we stored earlier (e.g. when a logo is replaced). Never throws. */
export async function deleteImageByUrl(url: string | null | undefined): Promise<void> {
  const s = storage();
  if (!s || !url || !url.startsWith(`${s.publicUrl}/`)) return;
  try {
    await s.client.send(new DeleteObjectCommand({ Bucket: s.bucket, Key: url.slice(s.publicUrl.length + 1) }));
  } catch (err: any) {
    logger.warn(`Could not delete old image: ${err?.message}`);
  }
}
