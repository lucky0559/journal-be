import { Body, Controller, Inject, Post } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { CurrentUser, User } from '../common/auth.guard';
import { parse } from '../common/parse';
import { DB, Db } from '../db/db.module';
import { media } from '../db/schema';
import { MEDIA_STORAGE, MediaStorage } from './media-storage';

const EXT: Record<'photo' | 'voice', Record<string, string>> = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' },
  voice: { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' },
};

const Body_ = z
  .object({ kind: z.enum(['photo', 'voice']), contentType: z.string() })
  .refine((b) => b.contentType in EXT[b.kind], { message: 'Unsupported content type for this kind', path: ['contentType'] });

@Controller('media')
export class MediaController {
  constructor(@Inject(DB) private db: Db, @Inject(MEDIA_STORAGE) private storage: MediaStorage) {}

  @Post('upload-url')
  async uploadUrl(@CurrentUser() me: User, @Body() raw: unknown) {
    const { kind, contentType } = parse(Body_, raw);
    const key = `${me.id}/${randomUUID()}.${EXT[kind][contentType]}`;
    await this.db.insert(media).values({ key, ownerId: me.id, kind, contentType });
    const { url, method, fields, expiresInSeconds } = await this.storage.createUpload(key);
    return { key, uploadUrl: url, method, fields, fileField: 'file', expiresInSeconds };
  }
}
