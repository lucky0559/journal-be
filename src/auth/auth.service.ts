import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DB, Db } from '../db/db.module';
import { users } from '../db/schema';
import { GOOGLE_VERIFIER, GoogleVerifier } from './google-verifier';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private db: Db,
    @Inject(GOOGLE_VERIFIER) private google: GoogleVerifier,
    private jwt: JwtService,
  ) {}

  async signInWithGoogle(idToken: string) {
    let profile;
    try {
      profile = await this.google.verify(idToken);
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    // Keep name/photo/email fresh from Google; bio is the user's own and is never overwritten.
    const [user] = await this.db
      .insert(users)
      .values({ googleSub: profile.sub, email: profile.email, name: profile.name, givenName: profile.givenName, photo: profile.picture })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: { email: profile.email, name: profile.name, givenName: profile.givenName, photo: profile.picture },
      })
      .returning();
    return { token: await this.jwt.signAsync({ sub: user.id }), user };
  }
}
