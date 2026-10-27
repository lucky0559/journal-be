import { MediaStorage } from '../src/media/media-storage';

export class FakeMediaStorage implements MediaStorage {
  uploaded = new Set<string>();
  deleted: string[] = [];
  async createUpload(key: string) {
    return { url: `http://media.test/upload`, method: 'POST' as const, fields: { public_id: key, signature: 'sig' }, expiresInSeconds: 3600 };
  }
  async presignRead(key: string) {
    return `http://media.test/get/${key}?sig=1`;
  }
  async delete(keys: string[]) {
    this.deleted.push(...keys);
  }
}
