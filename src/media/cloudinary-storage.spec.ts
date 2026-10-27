import { createHash } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { loadConfig } from '../config';
import { CloudinaryMediaStorage, describeKey } from './cloudinary-storage';

const baseEnv = {
  DATABASE_URL: 'postgres://x',
  JWT_SECRET: 'x'.repeat(32),
  GOOGLE_WEB_CLIENT_ID: 'g',
  CLOUDINARY_URL: 'cloudinary://123456:s3cr3t@demo-cloud',
};

describe('describeKey', () => {
  it('drops the extension and files audio under video', () => {
    expect(describeKey('u1/abc.jpg')).toEqual({ publicId: 'u1/abc', resourceType: 'image' });
    expect(describeKey('u1/abc.heic')).toEqual({ publicId: 'u1/abc', resourceType: 'image' });
    expect(describeKey('u1/abc.m4a')).toEqual({ publicId: 'u1/abc', resourceType: 'video' });
    expect(describeKey('u1/abc.MP3')).toEqual({ publicId: 'u1/abc', resourceType: 'video' });
  });
});

describe('Cloudinary config', () => {
  it('reads cloud name, key and secret from CLOUDINARY_URL', () => {
    expect(loadConfig(baseEnv).media).toEqual({ cloudName: 'demo-cloud', apiKey: '123456', apiSecret: 's3cr3t' });
  });
  it('explains a malformed value', () => {
    expect(() => loadConfig({ ...baseEnv, CLOUDINARY_URL: 'https://example.com' })).toThrow(/CLOUDINARY_URL must look like/);
    expect(() => loadConfig({ ...baseEnv, CLOUDINARY_URL: undefined })).toThrow(/CLOUDINARY_URL/);
  });
});

describe('CloudinaryMediaStorage', () => {
  const storage = new CloudinaryMediaStorage({ ...loadConfig(baseEnv) });

  it('signs an authenticated upload with the SHA-1 recipe from the Cloudinary docs', async () => {
    const slot = await storage.createUpload('u1/abc.jpg');
    const { fields } = slot;
    expect(slot).toMatchObject({ url: 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload', method: 'POST', expiresInSeconds: 3600 });
    expect(fields).toMatchObject({ public_id: 'u1/abc', type: 'authenticated', api_key: '123456' });
    const expected = createHash('sha1').update(`public_id=u1/abc&timestamp=${fields.timestamp}&type=authenticateds3cr3t`).digest('hex');
    expect(fields.signature).toBe(expected);
    expect(Math.abs(Number(fields.timestamp) - Date.now() / 1000)).toBeLessThan(5);
  });

  it('uploads voice notes through the video endpoint', async () => {
    expect((await storage.createUpload('u1/abc.m4a')).url).toBe('https://api.cloudinary.com/v1_1/demo-cloud/video/upload');
  });

  it('never exposes the API secret', async () => {
    const slot = await storage.createUpload('u1/abc.jpg');
    expect(JSON.stringify(slot)).not.toContain('s3cr3t');
    expect(await storage.presignRead('u1/abc.jpg')).not.toContain('s3cr3t');
  });

  it('hands out signed delivery urls for authenticated assets', async () => {
    const photo = await storage.presignRead('u1/abc.jpg');
    expect(photo).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/authenticated\/s--[\w-]{8}--\/v1\/u1\/abc$/);
    const voice = await storage.presignRead('u1/abc.m4a');
    expect(voice).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\/video\/authenticated\/s--[\w-]{8}--\/v1\/u1\/abc$/);
  });

  it('deletes by resource type, purging the CDN', async () => {
    const spy = jest.spyOn(cloudinary.api, 'delete_resources').mockResolvedValue({} as never);
    await storage.delete(['u1/a.jpg', 'u1/b.m4a', 'u1/c.png']);
    expect(spy).toHaveBeenCalledWith(['u1/a', 'u1/c'], { resource_type: 'image', type: 'authenticated', invalidate: true });
    expect(spy).toHaveBeenCalledWith(['u1/b'], { resource_type: 'video', type: 'authenticated', invalidate: true });
    spy.mockClear();
    await storage.delete([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
