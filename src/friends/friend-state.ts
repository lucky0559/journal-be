import { and, eq, or } from 'drizzle-orm';
import type { Db } from '../db/db.module';
import { friendships } from '../db/schema';

export type FriendState = 'self' | 'none' | 'requested' | 'incoming' | 'friends';

/** How `viewer` relates to `other`: requested = viewer asked them, incoming = they asked viewer. */
export async function friendStateBetween(db: Db, viewerId: string, otherId: string): Promise<FriendState> {
  if (viewerId === otherId) return 'self';
  const [row] = await db
    .select()
    .from(friendships)
    .where(or(
      and(eq(friendships.requesterId, viewerId), eq(friendships.addresseeId, otherId)),
      and(eq(friendships.requesterId, otherId), eq(friendships.addresseeId, viewerId)),
    ))
    .limit(1);
  if (!row) return 'none';
  if (row.status === 'accepted') return 'friends';
  return row.requesterId === viewerId ? 'requested' : 'incoming';
}
