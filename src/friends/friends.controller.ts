import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, User } from '../common/auth.guard';
import { parse, uuid } from '../common/parse';
import { publicUser } from '../users/users.controller';
import { FriendsService } from './friends.service';

const RequestBody = z.object({ userId: uuid });

@Controller('friends')
export class FriendsController {
  constructor(private friends: FriendsService) {}

  @Get()
  async list(@CurrentUser() me: User) {
    return (await this.friends.friends(me.id)).map(publicUser);
  }

  @Get('requests')
  async incoming(@CurrentUser() me: User) {
    return (await this.friends.incoming(me.id)).map(publicUser);
  }

  @Post('requests')
  async request(@CurrentUser() me: User, @Body() body: unknown) {
    const { userId } = parse(RequestBody, body);
    return { friendState: await this.friends.request(me.id, userId) };
  }

  @Post('requests/:userId/accept')
  @HttpCode(200)
  async accept(@CurrentUser() me: User, @Param('userId') userId: string) {
    return { friendState: await this.friends.accept(me.id, parse(uuid, userId)) };
  }

  @Post('requests/:userId/decline')
  @HttpCode(204)
  async decline(@CurrentUser() me: User, @Param('userId') userId: string) {
    await this.friends.decline(me.id, parse(uuid, userId));
  }

  @Delete('requests/:userId')
  @HttpCode(204)
  async cancel(@CurrentUser() me: User, @Param('userId') userId: string) {
    await this.friends.cancel(me.id, parse(uuid, userId));
  }

  @Delete(':userId')
  @HttpCode(204)
  async unfriend(@CurrentUser() me: User, @Param('userId') userId: string) {
    await this.friends.unfriend(me.id, parse(uuid, userId));
  }
}
