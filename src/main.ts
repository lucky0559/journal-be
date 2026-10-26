import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './config';
import { configureApp } from './configure-app';

async function bootstrap() {
  const config = loadConfig(); // fail fast with a readable message if env is incomplete
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(config.port, '0.0.0.0');
}

bootstrap();
