import { sql } from 'drizzle-orm';
import { createTestDb } from '../../test/testDb';
import { users, posts, friendships, reactions, media } from './schema';

describe('schema', () => {
  it('creates a user, a post and cascades on user delete', async () => {
    const { db, close } = await createTestDb();
    const [u] = await db.insert(users).values({ googleSub: 'g1', email: 'a@b.c', name: 'A B', givenName: 'A' }).returning();
    const postId = '11111111-1111-4111-8111-111111111111';
    await db.insert(posts).values({ id: postId, authorId: u.id, date: '2026-10-08', time: '9:41 pm', vis: 'public', text: 'hi' });
    await db.insert(reactions).values({ postId, userId: u.id, kind: 'hug' });
    await db.insert(media).values({ key: 'k1', ownerId: u.id, kind: 'photo', contentType: 'image/jpeg' });
    await db.delete(users);
    for (const t of [posts, reactions, media]) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t);
      expect(n).toBe(0);
    }
    await close();
  });

  it('rejects a duplicate google account and a self-friendship', async () => {
    const { db, close } = await createTestDb();
    const [u] = await db.insert(users).values({ googleSub: 'g1', email: 'a@b.c', name: 'A', givenName: 'A' }).returning();
    await expect(db.insert(users).values({ googleSub: 'g1', email: 'x@y.z', name: 'X', givenName: 'X' })).rejects.toThrow();
    await expect(db.insert(friendships).values({ requesterId: u.id, addresseeId: u.id, status: 'pending' })).rejects.toThrow();
    await close();
  });

  it('stores private pages with mood and feelings, and refuses unknown visibilities', async () => {
    const { db, close } = await createTestDb();
    const [u] = await db.insert(users).values({ googleSub: 'g1', email: 'a@b.c', name: 'A', givenName: 'A' }).returning();
    const page = { authorId: u.id, date: '2026-10-08', time: '9:00 pm', text: 'x' };
    const [row] = await db
      .insert(posts)
      .values({ id: '22222222-2222-4222-8222-222222222222', ...page, vis: 'private', mood: 30, feelings: ['tired'] })
      .returning();
    expect(row).toMatchObject({ vis: 'private', mood: 30, feelings: ['tired'] });
    await expect(db.insert(posts).values({ id: '33333333-3333-4333-8333-333333333333', ...page, vis: 'secret' as never })).rejects.toThrow();
    await close();
  });
});
