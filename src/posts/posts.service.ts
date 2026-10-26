import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { media, posts, reactions, users } from '../db/schema';
import { friendStateBetween } from '../friends/friend-state';
import { FriendsService } from '../friends/friends.service';
import { MEDIA_STORAGE, MediaStorage } from '../media/media-storage';
import { canRead } from './visibility';

export type PostRow = typeof posts.$inferSelect;
export interface PublishInput {
  date: string; time: string; vis: 'friends' | 'public'; prompt: string; text: string;
  stickers: string[]; photos: string[]; voices: { key: string; seconds: number }[];
}

const mediaKeys = (p: Pick<PostRow, 'photos' | 'voices'>) => [...p.photos, ...p.voices.map((v) => v.key)];

export const encodeCursor = (p: Pick<PostRow, 'createdAt' | 'id'>) => `${p.createdAt.toISOString()}_${p.id}`;
export const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/i;

@Injectable()
export class PostsService {
  constructor(
    @Inject(DB) private db: Db,
    @Inject(MEDIA_STORAGE) private storage: MediaStorage,
    private friends: FriendsService,
  ) {}

  // ---- publishing -------------------------------------------------------

  async publish(me: string, id: string, input: PublishInput) {
    const wanted = [...input.photos, ...input.voices.map((v) => v.key)];
    if (new Set(wanted).size !== wanted.length) throw new BadRequestException('A file can only be attached once');
    if (wanted.length) {
      const owned = await this.db.select().from(media).where(and(inArray(media.key, wanted), eq(media.ownerId, me)));
      const kindOf = new Map(owned.map((m) => [m.key, m.kind]));
      const ok = input.photos.every((k) => kindOf.get(k) === 'photo') && input.voices.every((v) => kindOf.get(v.key) === 'voice');
      if (!ok) throw new BadRequestException('Attached media must be your own uploads of the right kind');
    }

    const [existing] = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (existing && existing.authorId !== me) throw new NotFoundException();

    const now = new Date();
    const values = { ...input, updatedAt: now };
    await this.db
      .insert(posts)
      .values({ id, authorId: me, createdAt: now, ...values })
      .onConflictDoUpdate({ target: posts.id, set: values, setWhere: eq(posts.authorId, me) });

    if (existing) await this.dropUnusedMedia(me, id, mediaKeys(existing).filter((k) => !wanted.includes(k)));
    return this.getForViewer(me, id);
  }

  async unpublish(me: string, id: string): Promise<void> {
    const [row] = await this.db.select().from(posts).where(and(eq(posts.id, id), eq(posts.authorId, me))).limit(1);
    if (!row) return;
    await this.db.delete(posts).where(eq(posts.id, id));
    await this.dropUnusedMedia(me, id, mediaKeys(row));
  }

  /** Delete files (and their records) that no other page of this author still uses. */
  private async dropUnusedMedia(me: string, exceptPostId: string, candidates: string[]) {
    if (!candidates.length) return;
    const others = await this.db.select().from(posts).where(and(eq(posts.authorId, me), ne(posts.id, exceptPostId)));
    const stillUsed = new Set(others.flatMap(mediaKeys));
    const gone = candidates.filter((k) => !stillUsed.has(k));
    if (!gone.length) return;
    await this.db.delete(media).where(and(inArray(media.key, gone), eq(media.ownerId, me)));
    await this.storage.delete(gone);
  }

  // ---- reading ----------------------------------------------------------

  private async readable(viewerId: string, row: PostRow): Promise<boolean> {
    if (viewerId === row.authorId || row.vis === 'public') return true;
    const isFriend = (await friendStateBetween(this.db, viewerId, row.authorId)) === 'friends';
    return canRead({ viewerId, authorId: row.authorId, vis: row.vis, isFriend });
  }

  async getForViewer(viewerId: string, id: string) {
    const [row] = await this.db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!row || !(await this.readable(viewerId, row))) throw new NotFoundException();
    return (await this.view(viewerId, [row]))[0];
  }

  async feed(viewerId: string, o: { tab: 'friends' | 'public'; limit: number; before?: string }) {
    let scope;
    if (o.tab === 'public') {
      scope = eq(posts.vis, 'public');
    } else {
      const ids = await this.friends.friendIds(viewerId);
      if (!ids.length) return { posts: [], nextBefore: null };
      scope = inArray(posts.authorId, ids);
    }
    return this.page(viewerId, scope, o);
  }

  async profilePosts(viewerId: string, userId: string, o: { limit: number; before?: string }) {
    const [author] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!author) throw new NotFoundException();
    const state = await friendStateBetween(this.db, viewerId, userId);
    const seesAll = state === 'self' || state === 'friends';
    const scope = seesAll ? eq(posts.authorId, userId) : and(eq(posts.authorId, userId), eq(posts.vis, 'public'));
    let hidden = 0;
    if (!seesAll) {
      const [{ n }] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(posts)
        .where(and(eq(posts.authorId, userId), eq(posts.vis, 'friends')));
      hidden = n;
    }
    return { ...(await this.page(viewerId, scope, o)), hidden };
  }

  private async page(viewerId: string, scope: ReturnType<typeof eq> | ReturnType<typeof and> | undefined, o: { limit: number; before?: string }) {
    const cursor = o.before ? CURSOR_RE.exec(o.before) : null;
    const where = cursor
      ? and(scope, sql`(${posts.createdAt}, ${posts.id}) < (${cursor[1]}::timestamptz, ${cursor[2]}::uuid)`)
      : scope;
    const rows = await this.db.select().from(posts).where(where).orderBy(desc(posts.createdAt), desc(posts.id)).limit(o.limit + 1);
    const pageRows = rows.slice(0, o.limit);
    return {
      posts: await this.view(viewerId, pageRows),
      nextBefore: rows.length > o.limit ? encodeCursor(pageRows[pageRows.length - 1]) : null,
    };
  }

  // ---- reactions --------------------------------------------------------

  async react(viewerId: string, postId: string, kind: 'hug' | 'same') {
    await this.getForViewer(viewerId, postId); // 404 unless readable
    await this.db.insert(reactions).values({ postId, userId: viewerId, kind }).onConflictDoNothing();
  }

  async unreact(viewerId: string, postId: string, kind: 'hug' | 'same') {
    await this.db.delete(reactions).where(and(eq(reactions.postId, postId), eq(reactions.userId, viewerId), eq(reactions.kind, kind)));
  }

  // ---- serialisation ----------------------------------------------------

  private async view(viewerId: string, rows: PostRow[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const authors = await this.db.select().from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.authorId))]));
    const counts = await this.db
      .select({ postId: reactions.postId, kind: reactions.kind, n: sql<number>`count(*)::int` })
      .from(reactions)
      .where(inArray(reactions.postId, ids))
      .groupBy(reactions.postId, reactions.kind);
    const mine = await this.db.select().from(reactions).where(and(inArray(reactions.postId, ids), eq(reactions.userId, viewerId)));

    return Promise.all(
      rows.map(async (r) => {
        const a = authors.find((u) => u.id === r.authorId)!;
        const n = (kind: 'hug' | 'same') => counts.find((c) => c.postId === r.id && c.kind === kind)?.n ?? 0;
        const has = (kind: 'hug' | 'same') => mine.some((m) => m.postId === r.id && m.kind === kind);
        return {
          id: r.id,
          author: { id: a.id, name: a.name, givenName: a.givenName, photo: a.photo, bio: a.bio },
          date: r.date, time: r.time, vis: r.vis, prompt: r.prompt, text: r.text, stickers: r.stickers,
          photos: await Promise.all(r.photos.map(async (key) => ({ key, url: await this.storage.presignRead(key) }))),
          voices: await Promise.all(r.voices.map(async (v) => ({ ...v, url: await this.storage.presignRead(v.key) }))),
          hug: n('hug'), same: n('same'), mine: { hug: has('hug'), same: has('same') },
          createdAt: r.createdAt.toISOString(),
        };
      }),
    );
  }
}
