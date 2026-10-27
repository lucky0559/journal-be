/** Where and how the app uploads one file: a multipart POST of `fields` plus the file. */
export interface UploadSlot {
  url: string;
  method: 'POST';
  fields: Record<string, string>;
  expiresInSeconds: number;
}

export interface MediaStorage {
  createUpload(key: string): Promise<UploadSlot>;
  presignRead(key: string): Promise<string>;
  delete(keys: string[]): Promise<void>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');
