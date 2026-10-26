import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const postVis = pgEnum('post_vis', ['friends', 'public']);
export const friendStatus = pgEnum('friend_status', ['pending', 'accepted']);
export const reactionKind = pgEnum('reaction_kind', ['hug', 'same']);
export const mediaKind = pgEnum('media_kind', ['photo', 'voice']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  givenName: text('given_name').notNull(),
  photo: text('photo'),
  bio: text('bio').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_google_sub_uq').on(t.googleSub)]);

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  time: text('time').notNull(),
  vis: postVis('vis').notNull(),
  prompt: text('prompt').notNull().default(''),
  text: text('text').notNull().default(''),
  stickers: jsonb('stickers').$type<string[]>().notNull().default([]),
  photos: jsonb('photos').$type<string[]>().notNull().default([]),
  voices: jsonb('voices').$type<{ key: string; seconds: number }[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('posts_author_idx').on(t.authorId, t.createdAt), index('posts_vis_idx').on(t.vis, t.createdAt)]);

export const friendships = pgTable('friendships', {
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addresseeId: uuid('addressee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: friendStatus('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.requesterId, t.addresseeId] }),
  check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  // one row per pair, whichever direction asked first
  uniqueIndex('friendships_pair_uq').on(sql`least(${t.requesterId}, ${t.addresseeId})`, sql`greatest(${t.requesterId}, ${t.addresseeId})`),
  index('friendships_addressee_idx').on(t.addresseeId),
]);

export const reactions = pgTable('reactions', {
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: reactionKind('kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.postId, t.userId, t.kind] })]);

export const media = pgTable('media', {
  key: text('key').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: mediaKind('kind').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
