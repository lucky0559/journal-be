import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createApp, TestUser } from '../../test/createApp';
import { media, posts } from '../db/schema';

type T = Awaited<ReturnType<typeof createApp>>;

describe('publishing pages', () => {
  let t: T;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  const body = (over: Record<string, unknown> = {}) => ({
    date: '2026-10-08', time: '9:41 pm', vis: 'friends', prompt: 'Who did you feel close to today?', text: 'Made pasta with Jun.',
    stickers: ['cozy'], photos: [], voices: [], ...over,
  });
  const upload = async (u: TestUser, kind: 'photo' | 'voice' = 'photo') =>
    (await t.http().post('/media/upload-url').set(t.auth(u)).send(kind === 'photo' ? { kind, contentType: 'image/jpeg' } : { kind, contentType: 'audio/mp4' }).expect(201)).body.key as string;
  const befriend = async (a: TestUser, b: TestUser) => {
    await t.http().post('/friends/requests').set(t.auth(a)).send({ userId: b.id }).expect(201);
    await t.http().post(`/friends/requests/${a.id}/accept`).set(t.auth(b)).expect(200);
  };
  const publish = (u: TestUser, id = randomUUID(), over: Record<string, unknown> = {}) =>
    t.http().put(`/posts/${id}`).set(t.auth(u)).send(body(over));

  it('publishes a page and returns it as the author sees it', async () => {
    const maya = await t.as('maya');
    const photo = await upload(maya);
    const voice = await upload(maya, 'voice');
    const id = randomUUID();
    const res = await publish(maya, id, { photos: [photo], voices: [{ key: voice, seconds: 38 }] }).expect(200);
    expect(res.body).toMatchObject({
      id, vis: 'friends', text: 'Made pasta with Jun.', stickers: ['cozy'], hug: 0, same: 0, mine: { hug: false, same: false },
      author: { id: maya.id, name: 'Maya Tester' },
    });
    expect(res.body.photos).toEqual([{ key: photo, url: expect.stringContaining(photo) }]);
    expect(res.body.voices).toEqual([{ key: voice, seconds: 38, url: expect.stringContaining(voice) }]);
    expect(res.body.updatedAt).toEqual(expect.any(String));
  });

  it('keeps mood and feelings for the author only: friends, feeds and profiles never see them', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await befriend(maya, jun);
    const id = randomUUID();
    const own = await publish(maya, id, { mood: 12, feelings: ['lonely'], vis: 'public' }).expect(200);
    expect(own.body).toMatchObject({ mood: 12, feelings: ['lonely'] });
    const seen = [
      (await t.http().get(`/posts/${id}`).set(t.auth(jun)).expect(200)).body,
      (await t.http().get('/feed?tab=friends').set(t.auth(jun)).expect(200)).body.posts[0],
      (await t.http().get('/feed?tab=public').set(t.auth(jun)).expect(200)).body.posts[0],
      (await t.http().get(`/users/${maya.id}/posts`).set(t.auth(jun)).expect(200)).body.posts[0],
    ];
    for (const post of seen) {
      expect(post.id).toBe(id);
      expect(post).not.toHaveProperty('mood');
      expect(post).not.toHaveProperty('feelings');
      expect(JSON.stringify(post)).not.toContain('lonely');
    }
  });

  it('refuses bad input and oversize content', async () => {
    const maya = await t.as('maya');
    await publish(maya, randomUUID(), { mood: 101 }).expect(400);
    await publish(maya, randomUUID(), { mood: -1 }).expect(400);
    await publish(maya, randomUUID(), { mood: 4.5 }).expect(400);
    await publish(maya, randomUUID(), { feelings: Array(21).fill('calm') }).expect(400);
    await publish(maya, randomUUID(), { vis: 'secret' }).expect(400);
    await publish(maya, randomUUID(), { date: '2026-13-45' }).expect(400);
    await publish(maya, randomUUID(), { date: 'yesterday' }).expect(400);
    await publish(maya, randomUUID(), { time: 'noon' }).expect(400);
    await publish(maya, randomUUID(), { text: 'x'.repeat(10_001) }).expect(400);
    await publish(maya, randomUUID(), { stickers: Array(21).fill('calm') }).expect(400);
    await t.http().put('/posts/not-a-uuid').set(t.auth(maya)).send(body()).expect(400);
    await t.http().put(`/posts/${randomUUID()}`).send(body()).expect(401);
  });

  it('only lets a page reference media the author uploaded', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    const junsPhoto = await upload(jun);
    await publish(maya, randomUUID(), { photos: [junsPhoto] }).expect(400);
    await publish(maya, randomUUID(), { photos: [`${maya.id}/not-uploaded.jpg`] }).expect(400);
    const voiceKey = await upload(maya, 'voice');
    await publish(maya, randomUUID(), { photos: [voiceKey] }).expect(400); // a voice note is not a photo
  });

  it('updates in place and removes media that was dropped from the page', async () => {
    const maya = await t.as('maya');
    const keep = await upload(maya); const drop = await upload(maya);
    const id = randomUUID();
    await publish(maya, id, { photos: [keep, drop] }).expect(200);
    const res = await publish(maya, id, { text: 'Edited', vis: 'public', photos: [keep] }).expect(200);
    expect(res.body).toMatchObject({ text: 'Edited', vis: 'public' });
    expect(t.storage.deleted).toEqual([drop]);
    const left = await t.db.select().from(media).where(eq(media.ownerId, maya.id));
    expect(left.map((m) => m.key)).toContain(keep);
    expect(left.map((m) => m.key)).not.toContain(drop);
    expect(await t.db.select().from(posts)).toHaveLength(1);
  });

  it('does not let someone else overwrite or delete your page', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    const id = randomUUID();
    await publish(maya, id).expect(200);
    await publish(jun, id, { text: 'hijack' }).expect(404);
    await t.http().delete(`/posts/${id}`).set(t.auth(jun)).expect(204);
    const [row] = await t.db.select().from(posts).where(eq(posts.id, id));
    expect(row.text).toBe('Made pasta with Jun.');
  });

  it('unpublishing deletes the page and its files, and is idempotent', async () => {
    const maya = await t.as('maya');
    const photo = await upload(maya);
    const id = randomUUID();
    await publish(maya, id, { photos: [photo] }).expect(200);
    await t.http().delete(`/posts/${id}`).set(t.auth(maya)).expect(204);
    expect(await t.db.select().from(posts)).toHaveLength(0);
    expect(t.storage.deleted).toEqual([photo]);
    expect(await t.db.select().from(media).where(eq(media.key, photo))).toHaveLength(0);
    await t.http().delete(`/posts/${id}`).set(t.auth(maya)).expect(204);
    await t.http().get(`/posts/${id}`).set(t.auth(maya)).expect(404);
  });

  describe('private pages (Only me)', () => {
    it('are stored with mood and feelings and readable only by their author', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun'); const kit = await t.as('kit');
      await befriend(maya, jun);
      const id = randomUUID();
      const res = await publish(maya, id, { vis: 'private', mood: 20, feelings: ['tired'], text: 'Rough day' }).expect(200);
      expect(res.body).toMatchObject({ id, vis: 'private', mood: 20, feelings: ['tired'], text: 'Rough day' });
      await t.http().get(`/posts/${id}`).set(t.auth(maya)).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(jun)).expect(404); // not even a friend
      await t.http().get(`/posts/${id}`).set(t.auth(kit)).expect(404);
    });

    it('never appear in anyone else’s feeds or profile views, or in the hidden count', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun'); const kit = await t.as('kit');
      await befriend(maya, jun);
      const secret = randomUUID(); const shared = randomUUID();
      await publish(maya, secret, { vis: 'private', text: 'secret' }).expect(200);
      await publish(maya, shared, { vis: 'friends', text: 'shared' }).expect(200);
      const ids = (r: { body: { posts: { id: string }[] } }) => r.body.posts.map((p) => p.id);
      expect(ids(await t.http().get('/feed?tab=friends').set(t.auth(jun)).expect(200))).toEqual([shared]);
      expect(ids(await t.http().get('/feed?tab=public').set(t.auth(jun)).expect(200))).toEqual([]);
      expect(ids(await t.http().get(`/users/${maya.id}/posts`).set(t.auth(jun)).expect(200))).toEqual([shared]);
      const stranger = await t.http().get(`/users/${maya.id}/posts`).set(t.auth(kit)).expect(200);
      expect(ids(stranger)).toEqual([]);
      expect(stranger.body.hidden).toBe(1); // the friends-only page, not the private one
    });

    it('cannot be reacted to by anyone else', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun');
      await befriend(maya, jun);
      const id = randomUUID();
      await publish(maya, id, { vis: 'private' }).expect(200);
      await t.http().put(`/posts/${id}/reactions/hug`).set(t.auth(jun)).expect(404);
    });

    it('keep their photos and voice notes, and switching a shared page to Only me hides it again', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun');
      await befriend(maya, jun);
      const photo = await upload(maya);
      const id = randomUUID();
      await publish(maya, id, { vis: 'friends', photos: [photo] }).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(jun)).expect(200);
      const res = await publish(maya, id, { vis: 'private', photos: [photo] }).expect(200);
      expect(res.body.photos).toEqual([{ key: photo, url: expect.stringContaining(photo) }]);
      expect(t.storage.deleted).toEqual([]); // nothing is deleted when a page goes private
      await t.http().get(`/posts/${id}`).set(t.auth(jun)).expect(404);
    });
  });

  describe('restoring the journal (GET /me/posts)', () => {
    it('returns all of my pages, whatever their visibility, with mood and feelings, newest first', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun');
      const a = randomUUID(); const b = randomUUID(); const c = randomUUID(); const others = randomUUID();
      const photo = await upload(maya);
      const wrote = Date.parse('2026-10-08T21:41:00Z');
      await publish(maya, a, { vis: 'private', mood: 10, feelings: ['calm'], photos: [photo], createdAt: wrote }).expect(200);
      await publish(maya, a, { vis: 'private', mood: 10, feelings: ['calm'], photos: [photo], createdAt: wrote + 99_999 }).expect(200); // only the first one counts
      await new Promise((r) => setTimeout(r, 5));
      await publish(maya, b, { vis: 'friends', mood: 50 }).expect(200);
      await new Promise((r) => setTimeout(r, 5));
      await publish(maya, c, { vis: 'public', mood: 90 }).expect(200);
      await publish(jun, others, { vis: 'private' }).expect(200);
      const res = await t.http().get('/me/posts').set(t.auth(maya)).expect(200);
      expect(res.body.posts.map((p: { id: string }) => p.id)).toEqual([c, b, a]);
      expect(res.body.posts[2]).toMatchObject({ vis: 'private', mood: 10, feelings: ['calm'] });
      expect(res.body.posts[2].photos).toEqual([{ key: photo, url: expect.stringContaining(photo) }]);
      expect(res.body.posts[0]).toMatchObject({ createdAt: expect.any(String), updatedAt: expect.any(String) });
      expect(res.body.posts[2].createdAt).toBe('2026-10-08T21:41:00.000Z'); // the phone's writing time is kept
    });

    it('pages through the journal and needs a sign-in', async () => {
      const maya = await t.as('maya');
      for (let i = 0; i < 3; i++) { await publish(maya, randomUUID(), { vis: 'private' }).expect(200); await new Promise((r) => setTimeout(r, 5)); }
      const first = await t.http().get('/me/posts?limit=2').set(t.auth(maya)).expect(200);
      expect(first.body.posts).toHaveLength(2);
      const second = await t.http().get(`/me/posts?limit=2&before=${encodeURIComponent(first.body.nextBefore)}`).set(t.auth(maya)).expect(200);
      expect(second.body.posts).toHaveLength(1);
      expect(second.body.nextBefore).toBeNull();
      await t.http().get('/me/posts').expect(401);
      await t.http().get('/me/posts?limit=0').set(t.auth(maya)).expect(400);
    });
  });

  describe('who can read it', () => {
    it('friends-only pages are readable by friends and the author, not strangers', async () => {
      const maya = await t.as('maya'); const jun = await t.as('jun'); const kit = await t.as('kit');
      await befriend(maya, jun);
      const id = randomUUID();
      await publish(maya, id).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(jun)).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(maya)).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(kit)).expect(404);
    });

    it('public pages are readable by any signed-in user', async () => {
      const maya = await t.as('maya'); const kit = await t.as('kit');
      const id = randomUUID();
      await publish(maya, id, { vis: 'public' }).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(kit)).expect(200);
      await t.http().get(`/posts/${id}`).expect(401);
    });

    it('flipping a public page to friends hides it from strangers immediately', async () => {
      const maya = await t.as('maya'); const kit = await t.as('kit');
      const id = randomUUID();
      await publish(maya, id, { vis: 'public' }).expect(200);
      await publish(maya, id, { vis: 'friends' }).expect(200);
      await t.http().get(`/posts/${id}`).set(t.auth(kit)).expect(404);
    });
  });
});

describe('feeds and profiles', () => {
  let t: T;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  const put = (u: TestUser, id: string, over: Record<string, unknown> = {}) =>
    t.http().put(`/posts/${id}`).set(t.auth(u)).send({ date: '2026-10-08', time: '9:00 pm', vis: 'friends', text: 'hello', ...over });
  const befriend = async (a: TestUser, b: TestUser) => {
    await t.http().post('/friends/requests').set(t.auth(a)).send({ userId: b.id }).expect(201);
    await t.http().post(`/friends/requests/${a.id}/accept`).set(t.auth(b)).expect(200);
  };
  const ids = (res: { body: { posts: { id: string }[] } }) => res.body.posts.map((p) => p.id);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function world() {
    const maya = await t.as('maya'); const jun = await t.as('jun'); const kit = await t.as('kit');
    await befriend(maya, jun);
    const ids = { junFriends: randomUUID(), junPublic: randomUUID(), kitPublic: randomUUID(), kitFriends: randomUUID(), mayaPublic: randomUUID() };
    await put(jun, ids.junFriends, { vis: 'friends' }).expect(200); await sleep(5);
    await put(jun, ids.junPublic, { vis: 'public' }).expect(200); await sleep(5);
    await put(kit, ids.kitPublic, { vis: 'public' }).expect(200); await sleep(5);
    await put(kit, ids.kitFriends, { vis: 'friends' }).expect(200); await sleep(5);
    await put(maya, ids.mayaPublic, { vis: 'public' }).expect(200);
    return { maya, jun, kit, p: ids };
  }

  it('Friends tab shows every page by accepted friends, newest first, and nothing from strangers or yourself', async () => {
    const { maya, p } = await world();
    const res = await t.http().get('/feed?tab=friends').set(t.auth(maya)).expect(200);
    expect(ids(res)).toEqual([p.junPublic, p.junFriends]);
  });

  it('Public tab shows every public page and no friends-only ones', async () => {
    const { maya, p } = await world();
    const res = await t.http().get('/feed?tab=public').set(t.auth(maya)).expect(200);
    expect(ids(res)).toEqual([p.mayaPublic, p.kitPublic, p.junPublic]);
  });

  it('a stranger’s Friends tab is empty and their Public tab excludes friends-only pages', async () => {
    const { kit, p } = await world();
    expect(ids(await t.http().get('/feed?tab=friends').set(t.auth(kit)).expect(200))).toEqual([]);
    expect(ids(await t.http().get('/feed?tab=public').set(t.auth(kit)).expect(200))).not.toContain(p.junFriends);
  });

  it('pages through the feed without duplicates or gaps', async () => {
    const { maya } = await world();
    const first = await t.http().get('/feed?tab=public&limit=2').set(t.auth(maya)).expect(200);
    expect(first.body.posts).toHaveLength(2);
    expect(first.body.nextBefore).toEqual(expect.any(String));
    const second = await t.http().get(`/feed?tab=public&limit=2&before=${encodeURIComponent(first.body.nextBefore)}`).set(t.auth(maya)).expect(200);
    expect(second.body.posts).toHaveLength(1);
    expect(second.body.nextBefore).toBeNull();
    const all = [...ids(first), ...ids(second)];
    expect(new Set(all).size).toBe(3);
  });

  it('validates the feed query', async () => {
    const { maya } = await world();
    await t.http().get('/feed').set(t.auth(maya)).expect(400);
    await t.http().get('/feed?tab=everyone').set(t.auth(maya)).expect(400);
    await t.http().get('/feed?tab=public&limit=0').set(t.auth(maya)).expect(400);
    await t.http().get('/feed?tab=public&limit=500').set(t.auth(maya)).expect(400);
    await t.http().get('/feed?tab=public&before=garbage').set(t.auth(maya)).expect(400);
  });

  it('profile: strangers see public pages and a count of the friends-only ones', async () => {
    const { kit, jun, p } = await world();
    const res = await t.http().get(`/users/${jun.id}/posts`).set(t.auth(kit)).expect(200);
    expect(ids(res)).toEqual([p.junPublic]);
    expect(res.body.hidden).toBe(1);
  });

  it('profile: friends see everything, authors see their own', async () => {
    const { maya, jun, p } = await world();
    const asFriend = await t.http().get(`/users/${jun.id}/posts`).set(t.auth(maya)).expect(200);
    expect(ids(asFriend)).toEqual([p.junPublic, p.junFriends]);
    expect(asFriend.body.hidden).toBe(0);
    const own = await t.http().get(`/users/${jun.id}/posts`).set(t.auth(jun)).expect(200);
    expect(own.body.hidden).toBe(0);
    expect(ids(own)).toHaveLength(2);
  });

  it('profile: a pending request does not unlock friends-only pages', async () => {
    const { kit, jun } = await world();
    await t.http().post('/friends/requests').set(t.auth(kit)).send({ userId: jun.id }).expect(201);
    const res = await t.http().get(`/users/${jun.id}/posts`).set(t.auth(kit)).expect(200);
    expect(res.body.hidden).toBe(1);
  });

  it('unfriending hides their friends-only pages again', async () => {
    const { maya, jun, p } = await world();
    await t.http().delete(`/friends/${jun.id}`).set(t.auth(maya)).expect(204);
    await t.http().get(`/posts/${p.junFriends}`).set(t.auth(maya)).expect(404);
    expect(ids(await t.http().get('/feed?tab=friends').set(t.auth(maya)).expect(200))).toEqual([]);
  });

  it('profile 404s for an unknown user', async () => {
    const { maya } = await world();
    await t.http().get('/users/00000000-0000-4000-8000-000000000000/posts').set(t.auth(maya)).expect(404);
  });

  it('deleting an account removes its pages and files', async () => {
    const { jun, p, maya } = await world();
    const photo = (await t.http().post('/media/upload-url').set(t.auth(jun)).send({ kind: 'photo', contentType: 'image/png' }).expect(201)).body.key;
    await put(jun, randomUUID(), { photos: [photo] }).expect(200);
    await t.http().delete('/me').set(t.auth(jun)).expect(204);
    expect(t.storage.deleted).toContain(photo);
    await t.http().get(`/posts/${p.junPublic}`).set(t.auth(maya)).expect(404);
    expect(await t.db.select().from(posts).where(eq(posts.authorId, jun.id))).toHaveLength(0);
  });
});

describe('reactions', () => {
  let t: T;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  async function setup() {
    const maya = await t.as('maya'); const jun = await t.as('jun'); const kit = await t.as('kit');
    const publicId = randomUUID(); const friendsId = randomUUID();
    await t.http().put(`/posts/${publicId}`).set(t.auth(jun)).send({ date: '2026-10-08', time: '9:00 pm', vis: 'public', text: 'p' }).expect(200);
    await t.http().put(`/posts/${friendsId}`).set(t.auth(jun)).send({ date: '2026-10-08', time: '9:00 pm', vis: 'friends', text: 'f' }).expect(200);
    return { maya, jun, kit, publicId, friendsId };
  }
  const get = async (u: TestUser, id: string) => (await t.http().get(`/posts/${id}`).set(t.auth(u)).expect(200)).body;

  it('adds a reaction once, counts it, and marks it as mine', async () => {
    const { maya, kit, publicId } = await setup();
    await t.http().put(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204);
    await t.http().put(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204); // idempotent
    await t.http().put(`/posts/${publicId}/reactions/same`).set(t.auth(kit)).expect(204);
    const asMaya = await get(maya, publicId);
    expect(asMaya).toMatchObject({ hug: 1, same: 1, mine: { hug: true, same: false } });
    expect((await get(kit, publicId)).mine).toEqual({ hug: false, same: true });
  });

  it('removes only your own reaction, idempotently', async () => {
    const { maya, kit, publicId } = await setup();
    await t.http().put(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204);
    await t.http().put(`/posts/${publicId}/reactions/hug`).set(t.auth(kit)).expect(204);
    await t.http().delete(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204);
    await t.http().delete(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204);
    expect((await get(kit, publicId)).hug).toBe(1);
  });

  it('only allows reacting to pages you can read', async () => {
    const { maya, friendsId } = await setup();
    await t.http().put(`/posts/${friendsId}/reactions/hug`).set(t.auth(maya)).expect(404);
  });

  it('rejects unknown reaction kinds and unknown posts', async () => {
    const { maya, publicId } = await setup();
    await t.http().put(`/posts/${publicId}/reactions/love`).set(t.auth(maya)).expect(400);
    await t.http().put(`/posts/${randomUUID()}/reactions/hug`).set(t.auth(maya)).expect(404);
  });

  it('shows reaction counts in feeds', async () => {
    const { maya, publicId } = await setup();
    await t.http().put(`/posts/${publicId}/reactions/hug`).set(t.auth(maya)).expect(204);
    const feed = await t.http().get('/feed?tab=public').set(t.auth(maya)).expect(200);
    expect(feed.body.posts.find((p: { id: string }) => p.id === publicId)).toMatchObject({ hug: 1, mine: { hug: true } });
  });
});
