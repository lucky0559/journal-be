import { Inject, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { AppConfig, CONFIG } from '../config';
import { MediaStorage, UploadSlot } from './media-storage';

const UPLOAD_TTL = 3600; // Cloudinary accepts a signature for one hour
const DELETE_BATCH = 100;
const AUDIO = new Set(['m4a', 'mp3', 'aac']);

type ResourceType = 'image' | 'video';

/** Our keys look like `<userId>/<uuid>.<ext>`; Cloudinary names assets without the extension, and files audio under `video`. */
export function describeKey(key: string): { publicId: string; resourceType: ResourceType } {
  const dot = key.lastIndexOf('.');
  const ext = dot < 0 ? '' : key.slice(dot + 1).toLowerCase();
  return { publicId: dot < 0 ? key : key.slice(0, dot), resourceType: AUDIO.has(ext) ? 'video' : 'image' };
}

/**
 * Cloudinary free plan. Files are stored as `authenticated` assets: the app uploads with a signature we issue,
 * and anyone who may read a page gets a signed delivery URL. Unpublishing deletes the files and purges the CDN.
 */
@Injectable()
export class CloudinaryMediaStorage implements MediaStorage {
  private cloudName: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(@Inject(CONFIG) config: AppConfig) {
    ({ cloudName: this.cloudName, apiKey: this.apiKey, apiSecret: this.apiSecret } = config.media);
    cloudinary.config({ cloud_name: this.cloudName, api_key: this.apiKey, api_secret: this.apiSecret, secure: true, analytics: false });
  }

  async createUpload(key: string): Promise<UploadSlot> {
    const { publicId, resourceType } = describeKey(key);
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { public_id: publicId, timestamp, type: 'authenticated' };
    return {
      url: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      method: 'POST',
      fields: { ...signed, timestamp: String(timestamp), api_key: this.apiKey, signature: cloudinary.utils.api_sign_request(signed, this.apiSecret) },
      expiresInSeconds: UPLOAD_TTL,
    };
  }

  async presignRead(key: string): Promise<string> {
    const { publicId, resourceType } = describeKey(key);
    return cloudinary.url(publicId, { resource_type: resourceType, type: 'authenticated', sign_url: true, secure: true });
  }

  async delete(keys: string[]): Promise<void> {
    for (const resourceType of ['image', 'video'] as const) {
      const ids = keys.map(describeKey).filter((k) => k.resourceType === resourceType).map((k) => k.publicId);
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        await cloudinary.api.delete_resources(ids.slice(i, i + DELETE_BATCH), { resource_type: resourceType, type: 'authenticated', invalidate: true });
      }
    }
  }
}
