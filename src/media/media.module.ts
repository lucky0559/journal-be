import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_STORAGE } from './media-storage';
import { CloudinaryMediaStorage } from './cloudinary-storage';

@Global()
@Module({
  controllers: [MediaController],
  providers: [{ provide: MEDIA_STORAGE, useClass: CloudinaryMediaStorage }],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
