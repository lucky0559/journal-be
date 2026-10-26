import { Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Patch } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, User } from '../common/auth.guard';
import { parse, uuid } from '../common/parse';
import { DB, Db } from '../db/db.module';
import { media, users } from '../db/schema';
import { friendStateBetween } from '../friends/friend-state';
import { MEDIA_STORAGE, MediaStorage } from '../media/media-storage';

const PatchMe = z.object({ bio: z.string().max(280) });

export const publicUser = (u: User) => ({ id: u.id, name: u.name, givenName: u.givenName, photo: u.photo, bio: u.bio });

@Controller()
export class UsersController {
  constructor(@Inject(DB) private db: Db, @Inject(MEDIA_STORAGE) private storage: MediaStorage) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return { ...publicUser(user), email: user.email };
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() body: unknown) {
    const { bio } = parse(PatchMe, body);
    const [updated] = await this.db.update(users).set({ bio }).where(eq(users.id, user.id)).returning();
    return { ...publicUser(updated), email: updated.email };
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: User) {
    // Collect media first: rows cascade away with the user, but the objects live in the bucket.
    const owned = await this.db.select({ key: media.key }).from(media).where(eq(media.ownerId, user.id));
    await this.db.delete(users).where(eq(users.id, user.id));
    await this.storage.delete(owned.map((m) => m.key));
  }

  @Get('users/:id')
  async profile(@CurrentUser() viewer: User, @Param('id') id: string) {
    const userId = parse(uuid, id);
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new NotFoundException();
    return { ...publicUser(u), friendState: await friendStateBetween(this.db, viewer.id, u.id) };
  }
}
