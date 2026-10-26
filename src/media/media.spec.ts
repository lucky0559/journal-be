import { eq } from 'drizzle-orm';
import { createApp } from '../../test/createApp';
import { media } from '../db/schema';

describe('media upload urls', () => {
  let t: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  it('returns a presigned PUT url under the user’s own prefix and records the key', async () => {
    const maya = await t.as('maya');
    const res = await t.http().post('/media/upload-url').set(t.auth(maya)).send({ kind: 'photo', contentType: 'image/jpeg' }).expect(201);
    expect(res.body.key).toMatch(new RegExp(`^${maya.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(res.body).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, expiresInSeconds: 300 });
    expect(res.body.uploadUrl).toContain(res.body.key);
    const rows = await t.db.select().from(media).where(eq(media.key, res.body.key));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: maya.id, kind: 'photo', contentType: 'image/jpeg' });
  });

  it('accepts voice notes and picks the extension from the content type', async () => {
    const maya = await t.as('maya');
    const res = await t.http().post('/media/upload-url').set(t.auth(maya)).send({ kind: 'voice', contentType: 'audio/mp4' }).expect(201);
    expect(res.body.key).toMatch(/\.m4a$/);
  });

  it('rejects unknown kinds and content types that do not match the kind', async () => {
    const maya = await t.as('maya');
    await t.http().post('/media/upload-url').set(t.auth(maya)).send({ kind: 'video', contentType: 'video/mp4' }).expect(400);
    await t.http().post('/media/upload-url').set(t.auth(maya)).send({ kind: 'photo', contentType: 'audio/mp4' }).expect(400);
    await t.http().post('/media/upload-url').set(t.auth(maya)).send({ kind: 'photo', contentType: 'text/html' }).expect(400);
    await t.http().post('/media/upload-url').send({ kind: 'photo', contentType: 'image/jpeg' }).expect(401);
  });
});
