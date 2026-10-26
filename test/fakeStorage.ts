import { MediaStorage } from '../src/media/media-storage';

export class FakeMediaStorage implements MediaStorage {
  uploaded = new Set<string>();
  deleted: string[] = [];
  async presignUpload(key: string, contentType: string) {
    return { url: `http://r2.test/put/${key}?ct=${encodeURIComponent(contentType)}`, expiresInSeconds: 300 };
  }
  async presignRead(key: string) {
    return `http://r2.test/get/${key}?sig=1`;
  }
  async delete(keys: string[]) {
    this.deleted.push(...keys);
  }
}
