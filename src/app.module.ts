import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { MediaModule } from './media/media.module';
import { FriendsModule } from './friends/friends.module';
import { PostsModule } from './posts/posts.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [ConfigModule, DbModule, MediaModule, AuthModule, UsersModule, FriendsModule, PostsModule],
  controllers: [HealthController],
})
export class AppModule {}
