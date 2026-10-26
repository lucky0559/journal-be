import { createApp } from '../../test/createApp';

describe('friends', () => {
  let t: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => { t = await createApp(); });
  afterEach(async () => { await t.close(); });

  const state = async (viewer: { id: string; token: string }, other: { id: string }) =>
    (await t.http().get(`/users/${other.id}`).set(t.auth(viewer)).expect(200)).body.friendState;

  it('sends a request that the other person sees as incoming', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    expect(await state(maya, jun)).toBe('requested');
    expect(await state(jun, maya)).toBe('incoming');
    const incoming = await t.http().get('/friends/requests').set(t.auth(jun)).expect(200);
    expect(incoming.body.map((u: { id: string }) => u.id)).toEqual([maya.id]);
    expect((await t.http().get('/friends/requests').set(t.auth(maya)).expect(200)).body).toEqual([]);
  });

  it('is idempotent when asking twice', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    const again = await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    expect(again.body.friendState).toBe('requested');
  });

  it('rejects a request to yourself, a malformed id and an unknown user', async () => {
    const maya = await t.as('maya');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: maya.id }).expect(400);
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: 'x' }).expect(400);
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: '00000000-0000-4000-8000-000000000000' }).expect(404);
  });

  it('accepting makes both people friends and lists them', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    const res = await t.http().post(`/friends/requests/${maya.id}/accept`).set(t.auth(jun)).expect(200);
    expect(res.body.friendState).toBe('friends');
    expect(await state(maya, jun)).toBe('friends');
    expect((await t.http().get('/friends').set(t.auth(maya)).expect(200)).body.map((u: { id: string }) => u.id)).toEqual([jun.id]);
    expect((await t.http().get('/friends').set(t.auth(jun)).expect(200)).body.map((u: { id: string }) => u.id)).toEqual([maya.id]);
    expect((await t.http().get('/friends/requests').set(t.auth(jun)).expect(200)).body).toEqual([]);
  });

  it('only the addressee can accept; nothing to accept gives 404', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun'); const ana = await t.as('ana');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    await t.http().post(`/friends/requests/${jun.id}/accept`).set(t.auth(maya)).expect(404);
    await t.http().post(`/friends/requests/${maya.id}/accept`).set(t.auth(ana)).expect(404);
    expect(await state(maya, jun)).toBe('requested');
  });

  it('a crossing request auto-accepts', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    const res = await t.http().post('/friends/requests').set(t.auth(jun)).send({ userId: maya.id }).expect(201);
    expect(res.body.friendState).toBe('friends');
  });

  it('asking someone who is already a friend changes nothing', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    await t.http().post(`/friends/requests/${maya.id}/accept`).set(t.auth(jun)).expect(200);
    const res = await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    expect(res.body.friendState).toBe('friends');
  });

  it('decline and cancel remove the pending request', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun'); const ana = await t.as('ana');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    await t.http().post(`/friends/requests/${maya.id}/decline`).set(t.auth(jun)).expect(204);
    expect(await state(maya, jun)).toBe('none');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: ana.id }).expect(201);
    await t.http().delete(`/friends/requests/${ana.id}`).set(t.auth(maya)).expect(204);
    expect(await state(maya, ana)).toBe('none');
    await t.http().delete(`/friends/requests/${ana.id}`).set(t.auth(maya)).expect(204); // idempotent
  });

  it('cancel never removes an accepted friendship', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    await t.http().post(`/friends/requests/${maya.id}/accept`).set(t.auth(jun)).expect(200);
    await t.http().delete(`/friends/requests/${jun.id}`).set(t.auth(maya)).expect(204);
    expect(await state(maya, jun)).toBe('friends');
  });

  it('unfriending removes the friendship for both sides', async () => {
    const maya = await t.as('maya'); const jun = await t.as('jun');
    await t.http().post('/friends/requests').set(t.auth(maya)).send({ userId: jun.id }).expect(201);
    await t.http().post(`/friends/requests/${maya.id}/accept`).set(t.auth(jun)).expect(200);
    await t.http().delete(`/friends/${jun.id}`).set(t.auth(maya)).expect(204);
    expect(await state(jun, maya)).toBe('none');
    await t.http().delete(`/friends/${jun.id}`).set(t.auth(maya)).expect(204); // idempotent
  });
});
