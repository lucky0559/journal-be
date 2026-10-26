import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../common/auth.guard';
import { AppConfig, CONFIG } from '../config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GOOGLE_VERIFIER, GoogleIdTokenVerifier } from './google-verifier';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (c: AppConfig) => ({ secret: c.jwtSecret, signOptions: { expiresIn: '30d' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: GOOGLE_VERIFIER, useClass: GoogleIdTokenVerifier },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
