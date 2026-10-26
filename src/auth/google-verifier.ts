import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AppConfig, CONFIG } from '../config';

export interface GoogleProfile { sub: string; email: string; name: string; givenName: string; picture: string | null }

export interface GoogleVerifier {
  /** Throws if the ID token is invalid, expired or issued for another app. */
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

@Injectable()
export class GoogleIdTokenVerifier implements GoogleVerifier {
  private client = new OAuth2Client();
  constructor(@Inject(CONFIG) private config: AppConfig) {}

  async verify(idToken: string): Promise<GoogleProfile> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.config.googleClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || p.email_verified === false) throw new Error('Unverified Google account');
    const name = p.name ?? p.email;
    return { sub: p.sub, email: p.email, name, givenName: p.given_name ?? name.split(/\s+/)[0], picture: p.picture ?? null };
  }
}
