import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { friendships, users } from '../db/schema';
import { FriendState, friendStateBetween } from './friend-state';

const PG_UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (e: unknown) => {
  const c = e as { code?: string; cause?: { code?: string } };
  return c?.code === PG_UNIQUE_VIOLATION || c?.cause?.code === PG_UNIQUE_VIOLATION;
};

const pair = (a: string, b: string) =>
  or(and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)), and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)));

@Injectable()
export class FriendsService {
  constructor(@Inject(DB) private db: Db) {}

  async request(me: string, targetId: string): Promise<FriendState> {
    if (me === targetId) throw new BadRequestException('You can’t add yourself');
    const [target] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) throw new NotFoundException();

    const [existing] = await this.db.select().from(friendships).where(pair(me, targetId)).limit(1);
    if (!existing) {
      try {
        await this.db.insert(friendships).values({ requesterId: me, addresseeId: targetId, status: 'pending' });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // lost a race with a crossing request: fall through and re-evaluate
        return this.request(me, targetId);
      }
    } else if (existing.status === 'pending' && existing.requesterId === targetId) {
      await this.db.update(friendships).set({ status: 'accepted' }).where(and(eq(friendships.requesterId, targetId), eq(friendships.addresseeId, me)));
    }
    return friendStateBetween(this.db, me, targetId);
  }

  async accept(me: string, requesterId: string): Promise<FriendState> {
    const rows = await this.db
      .update(friendships)
      .set({ status: 'accepted' })
      .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, me), eq(friendships.status, 'pending')))
      .returning();
    if (!rows.length) throw new NotFoundException();
    return 'friends';
  }

  async decline(me: string, requesterId: string): Promise<void> {
    await this.db.delete(friendships).where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, me), eq(friendships.status, 'pending')));
  }

  async cancel(me: string, addresseeId: string): Promise<void> {
    await this.db.delete(friendships).where(and(eq(friendships.requesterId, me), eq(friendships.addresseeId, addresseeId), eq(friendships.status, 'pending')));
  }

  async unfriend(me: string, otherId: string): Promise<void> {
    await this.db.delete(friendships).where(and(pair(me, otherId), eq(friendships.status, 'accepted')));
  }

  async friendIds(me: string): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, me), eq(friendships.addresseeId, me))));
    return rows.map((r) => (r.requesterId === me ? r.addresseeId : r.requesterId));
  }

  async friends(me: string) {
    const ids = await this.friendIds(me);
    return ids.length ? this.db.select().from(users).where(inArray(users.id, ids)).orderBy(users.name) : [];
  }

  async incoming(me: string) {
    const rows = await this.db
      .select({ requesterId: friendships.requesterId })
      .from(friendships)
      .where(and(eq(friendships.addresseeId, me), eq(friendships.status, 'pending')))
      .orderBy(desc(friendships.createdAt));
    const ids = rows.map((r) => r.requesterId);
    if (!ids.length) return [];
    const found = await this.db.select().from(users).where(inArray(users.id, ids));
    return ids.map((id) => found.find((u) => u.id === id)!).filter(Boolean);
  }
}
