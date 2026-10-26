import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { CONFIG, AppConfig } from '../src/config';
import { DB } from '../src/db/db.module';
import { GOOGLE_VERIFIER, GoogleProfile, GoogleVerifier } from '../src/auth/google-verifier';
import { MEDIA_STORAGE } from '../src/media/media-storage';
import { FakeMediaStorage } from './fakeStorage';
import { createTestDb } from './testDb';

export const TEST_CONFIG: AppConfig = {
  port: 0,
  databaseUrl: 'unused',
  jwtSecret: 'test-secret-test-secret-test-secret',
  googleClientId: 'web-client-id',
  media: { bucket: 'test-bucket', endpoint: 'http://r2.test', accessKeyId: 'k', secretAccessKey: 's', region: 'auto' },
};

/** Tokens like "tok:maya" verify as Google user "maya"; anything else is rejected. */
class FakeGoogleVerifier implements GoogleVerifier {
  async verify(idToken: string): Promise<GoogleProfile> {
    const m = /^tok:(\w+)$/.exec(idToken);
    if (!m) throw new Error('invalid token');
    const n = m[1];
    return { sub: `sub-${n}`, email: `${n}@example.com`, name: `${n[0].toUpperCase()}${n.slice(1)} Tester`, givenName: `${n[0].toUpperCase()}${n.slice(1)}`, picture: null };
  }
}

export interface TestUser { id: string; token: string }

export async function createApp() {
  const { db, close } = await createTestDb();
  const storage = new FakeMediaStorage();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB).useValue(db)
    .overrideProvider(CONFIG).useValue(TEST_CONFIG)
    .overrideProvider(GOOGLE_VERIFIER).useValue(new FakeGoogleVerifier())
    .overrideProvider(MEDIA_STORAGE).useValue(storage)
    .compile();
  const app: INestApplication = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  const http = () => request(app.getHttpServer());
  const users = new Map<string, TestUser>();

  /** Sign in as a named test user (created on first use). */
  async function as(name: string): Promise<TestUser> {
    const cached = users.get(name);
    if (cached) return cached;
    const res = await http().post('/auth/google').send({ idToken: `tok:${name}` }).expect(201);
    const u = { id: res.body.user.id as string, token: res.body.token as string };
    users.set(name, u);
    return u;
  }
  const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

  return { app, db, http, storage, as, auth, close: async () => { await app.close(); await close(); } };
}
