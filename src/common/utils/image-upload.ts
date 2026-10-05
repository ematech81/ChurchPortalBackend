import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

/** Only real images; the extension comes from the verified MIME type, never the client's filename. */
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Multer options for an image upload stored under uploads/<subdir>/ with a random name. */
export function imageUploadOptions(subdir: string) {
  return {
    storage: diskStorage({
      destination: (_req: any, _file: any, cb: any) => {
        const dir = join(process.cwd(), 'uploads', subdir);
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req: any, file: any, cb: any) => {
        cb(null, `${randomUUID()}.${IMAGE_EXT[file.mimetype] ?? 'jpg'}`);
      },
    }),
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!IMAGE_EXT[file.mimetype]) {
        return cb(new BadRequestException('Only JPEG, PNG or WebP images are allowed.'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  };
}

export function publicUploadUrl(req: any, subdir: string, filename: string) {
  return `${req.protocol}://${req.get('host')}/uploads/${subdir}/${filename}`;
}
