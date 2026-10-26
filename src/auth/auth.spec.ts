import { createApp } from '../../test/createApp';

describe('auth and profile', () => {
  let t: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  it('signs in with a valid Google token and creates the user once', async () => {
    const first = await t.http().post('/auth/google').send({ idToken: 'tok:maya' }).expect(201);
    expect(first.body.token).toEqual(expect.any(String));
    expect(first.body.user).toMatchObject({ name: 'Maya Tester', givenName: 'Maya', email: 'maya@example.com', bio: '' });
    const second = await t.http().post('/auth/google').send({ idToken: 'tok:maya' }).expect(201);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('rejects an invalid Google token with 401 and a missing one with 400', async () => {
    await t.http().post('/auth/google').send({ idToken: 'garbage' }).expect(401);
    await t.http().post('/auth/google').send({}).expect(400);
    await t.http().post('/auth/google').send({ idToken: 42 }).expect(400);
  });

  it('protects routes behind a bearer token', async () => {
    await t.http().get('/me').expect(401);
    await t.http().get('/me').set('Authorization', 'Bearer nope').expect(401);
    const maya = await t.as('maya');
    const res = await t.http().get('/me').set(t.auth(maya)).expect(200);
    expect(res.body).toMatchObject({ id: maya.id, email: 'maya@example.com' });
  });

  it('updates the bio, with a length limit', async () => {
    const maya = await t.as('maya');
    const ok = await t.http().patch('/me').set(t.auth(maya)).send({ bio: 'Writing one line a day.' }).expect(200);
    expect(ok.body.bio).toBe('Writing one line a day.');
    await t.http().patch('/me').set(t.auth(maya)).send({ bio: 'x'.repeat(281) }).expect(400);
    await t.http().patch('/me').set(t.auth(maya)).send({ bio: 5 }).expect(400);
  });

  it('shows other people’s profile without leaking their email', async () => {
    const maya = await t.as('maya');
    const jun = await t.as('jun');
    const res = await t.http().get(`/users/${jun.id}`).set(t.auth(maya)).expect(200);
    expect(res.body).toMatchObject({ id: jun.id, name: 'Jun Tester', friendState: 'none' });
    expect(res.body.email).toBeUndefined();
    expect(res.body.googleSub).toBeUndefined();
  });

  it('answers 404 for an unknown user and 400 for a malformed id', async () => {
    const maya = await t.as('maya');
    await t.http().get('/users/00000000-0000-4000-8000-000000000000').set(t.auth(maya)).expect(404);
    await t.http().get('/users/not-a-uuid').set(t.auth(maya)).expect(400);
  });

  it('deletes the account and invalidates its token', async () => {
    const maya = await t.as('maya');
    await t.http().delete('/me').set(t.auth(maya)).expect(204);
    await t.http().get('/me').set(t.auth(maya)).expect(401);
  });

  it('serves a health check without auth', async () => {
    const res = await t.http().get('/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});
