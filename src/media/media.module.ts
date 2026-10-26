import { Global, Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MEDIA_STORAGE } from './media-storage';
import { R2MediaStorage } from './r2-storage';

@Global()
@Module({
  controllers: [MediaController],
  providers: [{ provide: MEDIA_STORAGE, useClass: R2MediaStorage }],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
