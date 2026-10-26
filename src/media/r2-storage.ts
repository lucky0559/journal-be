import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config';
import { MediaStorage } from './media-storage';

const UPLOAD_TTL = 300;
const READ_TTL = 3600;

/** Cloudflare R2 (or any S3-compatible bucket). Objects are private; reads go through signed URLs. */
@Injectable()
export class R2MediaStorage implements MediaStorage {
  private s3: S3Client;
  private bucket: string;

  constructor(@Inject(CONFIG) config: AppConfig) {
    this.bucket = config.media.bucket;
    this.s3 = new S3Client({
      region: config.media.region,
      endpoint: config.media.endpoint,
      credentials: { accessKeyId: config.media.accessKeyId, secretAccessKey: config.media.secretAccessKey },
    });
  }

  async presignUpload(key: string, contentType: string) {
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: UPLOAD_TTL });
    return { url, expiresInSeconds: UPLOAD_TTL };
  }

  presignRead(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: READ_TTL });
  }

  async delete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }));
  }
}
