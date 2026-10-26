import { Controller, Delete, Get, HttpCode, Param, Put, Query, Body } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, User } from '../common/auth.guard';
import { parse, uuid } from '../common/parse';
import { CURSOR_RE, PostsService } from './posts.service';

const realDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'Not a real date');

const Publish = z.object({
  date: realDate,
  time: z.string().regex(/^\d{1,2}:\d{2} (am|pm)$/),
  vis: z.enum(['friends', 'public']),
  prompt: z.string().max(300).default(''),
  text: z.string().max(10_000).default(''),
  stickers: z.array(z.string().min(1).max(30)).max(20).default([]),
  photos: z.array(z.string().min(1).max(200)).max(10).default([]),
  voices: z.array(z.object({ key: z.string().min(1).max(200), seconds: z.number().int().min(1).max(3600) })).max(5).default([]),
});

const Paging = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().regex(CURSOR_RE).optional(),
};
const FeedQuery = z.object({ tab: z.enum(['friends', 'public']), ...Paging });
const ProfileQuery = z.object(Paging);
const Kind = z.enum(['hug', 'same']);

@Controller()
export class PostsController {
  constructor(private posts: PostsService) {}

  @Put('posts/:id')
  publish(@CurrentUser() me: User, @Param('id') id: string, @Body() body: unknown) {
    return this.posts.publish(me.id, parse(uuid, id), parse(Publish, body));
  }

  @Delete('posts/:id')
  @HttpCode(204)
  async unpublish(@CurrentUser() me: User, @Param('id') id: string) {
    await this.posts.unpublish(me.id, parse(uuid, id));
  }

  @Get('posts/:id')
  get(@CurrentUser() me: User, @Param('id') id: string) {
    return this.posts.getForViewer(me.id, parse(uuid, id));
  }

  @Get('feed')
  feed(@CurrentUser() me: User, @Query() q: unknown) {
    return this.posts.feed(me.id, parse(FeedQuery, q));
  }

  @Get('users/:id/posts')
  profilePosts(@CurrentUser() me: User, @Param('id') id: string, @Query() q: unknown) {
    return this.posts.profilePosts(me.id, parse(uuid, id), parse(ProfileQuery, q));
  }

  @Put('posts/:id/reactions/:kind')
  @HttpCode(204)
  async react(@CurrentUser() me: User, @Param('id') id: string, @Param('kind') kind: string) {
    await this.posts.react(me.id, parse(uuid, id), parse(Kind, kind));
  }

  @Delete('posts/:id/reactions/:kind')
  @HttpCode(204)
  async unreact(@CurrentUser() me: User, @Param('id') id: string, @Param('kind') kind: string) {
    await this.posts.unreact(me.id, parse(uuid, id), parse(Kind, kind));
  }
}
