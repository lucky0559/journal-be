export interface MediaStorage {
  presignUpload(key: string, contentType: string): Promise<{ url: string; expiresInSeconds: number }>;
  presignRead(key: string): Promise<string>;
  delete(keys: string[]): Promise<void>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
