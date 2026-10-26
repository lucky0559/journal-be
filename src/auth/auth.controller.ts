import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../common/auth.guard';
import { parse } from '../common/parse';
import { AuthService } from './auth.service';

const GoogleBody = z.object({ idToken: z.string().min(1) });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('google')
  async google(@Body() body: unknown) {
    const { idToken } = parse(GoogleBody, body);
    return this.auth.signInWithGoogle(idToken);
  }
}
