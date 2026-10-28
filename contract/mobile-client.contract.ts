import { createApp } from '../test/createApp';
import { createApiClient } from '../../journ-al/mobile/src/api/client';
import { createApiAuthGateway } from '../../journ-al/mobile/src/api/apiAuthGateway';
import { createApiSharingGateway } from '../../journ-al/mobile/src/api/apiSharingGateway';
import { createSocialApi } from '../../journ-al/mobile/src/social/socialApi';

const ok = (c: boolean, m: string) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok  -', m); };

test('the mobile client talks to the real backend', async () => {
  const t = await createApp();
  await t.app.listen(0);
  const baseUrl = (await t.app.getUrl()).replace('[::1]', 'localhost');

  const sessionFor = async (name: string) => {
    let token: string | null = null;
    const api = createApiClient({ baseUrl, getToken: () => token, onUnauthorized: () => { token = null; } });
    const ex = await createApiAuthGateway(api).exchange(`tok:${name}`, { id: 'g', email: '', name: '', givenName: '', photo: null });
    token = ex.token;
    const uploads: string[] = [];
    const fetchImpl = (async (url: string) => { uploads.push(String(url)); return { ok: true, status: 200 }; }) as unknown as typeof fetch;
    return { api, user: ex.user!, social: createSocialApi(api), sharing: createApiSharingGateway({ api, fetchImpl }), uploads };
  };

  const maya = await sessionFor('maya');
  const jun = await sessionFor('jun');
  ok(/^[0-9a-f-]{36}$/.test(maya.user.id), 'sign-in returns the server user id');

  ok((await jun.social.requestFriend(maya.user.id)) === 'requested', 'jun sends a request');
  ok((await maya.social.incoming()).map((u) => u.id).includes(jun.user.id), 'maya sees it as incoming');
  ok((await maya.social.user(jun.user.id)).friendState === 'incoming', 'profile reports incoming');
  ok((await maya.social.accept(jun.user.id)) === 'friends', 'maya accepts');

  const id = '11111111-1111-4111-8111-111111111111';
  const entry = {
    id, createdAt: 1, date: '2026-10-08', time: '9:41 pm', mood: 12, feelings: ['lonely'], text: 'Made pasta with Jun.', prompt: 'Who?', vis: 'friends' as const,
    photos: [{ id: 'p', uri: 'file:///doc/media/a.jpg' }], voices: [{ id: 'v', uri: 'file:///doc/media/b.m4a', seconds: 38 }], stickers: ['cozy'], publishedAt: null,
  };
  const sent = await maya.sharing.publish(entry);
  ok(!!sent.photos[0].remoteKey && !!sent.voices[0].remoteKey, 'publish uploads media and returns remote keys');
  ok(maya.uploads.length === 2, 'two uploads were made');

  const feed = await jun.social.feed('friends');
  const post = feed.posts[0];
  ok(feed.posts.length === 1 && post.id === id && post.text === 'Made pasta with Jun.', 'jun sees maya’s page in the Friends feed');
  ok(post.photos[0].url.includes(sent.photos[0].remoteKey!) && post.voices[0].seconds === 38, 'photo/voice urls and seconds come back');
  ok(!('mood' in post) && !JSON.stringify(post).includes('lonely'), 'mood and feelings never reach other people');

  await jun.social.react(id, 'hug');
  const again = await jun.social.feed('friends');
  ok(again.posts[0].hug === 1 && again.posts[0].mine.hug === true, 'reaction counted and marked mine');

  const before = maya.uploads.length;
  await maya.sharing.publish(sent);
  ok(maya.uploads.length === before, 're-publish reuses remembered file keys');

  const kit = await sessionFor('kit');
  const strangerView = await kit.social.userPosts(maya.user.id);
  ok(strangerView.posts.length === 0 && strangerView.hidden === 1, 'a stranger sees nothing but a hidden count');

  await maya.sharing.unpublish(id);
  ok((await jun.social.feed('friends')).posts.length === 0, 'unpublish removes it from friends’ feeds');

  const reshared = await maya.sharing.publish(sent);
  ok(!!reshared.photos[0].remoteKey && reshared.photos[0].remoteKey !== sent.photos[0].remoteKey, 'stale keys trigger a clean re-upload');

  // ---- the whole journal follows the account to a second phone ----
  const secretId = '33333333-3333-4333-8333-333333333333';
  const secret = {
    id: secretId, createdAt: Date.parse('2026-10-09T20:00:00Z'), date: '2026-10-09', time: '8:00 pm', mood: 18, feelings: ['tired'],
    text: 'A heavy day, just for me.', prompt: '', vis: 'private' as const,
    photos: [{ id: 'p2', uri: 'file:///doc/media/c.jpg' }], voices: [], stickers: [], publishedAt: null,
  };
  const savedSecret = await maya.sharing.publish(secret);
  ok(!!savedSecret.photos[0].remoteKey && typeof savedSecret.publishedAt === 'number', 'an Only me page is saved to the account with its photo, and the server time comes back');
  ok((await jun.social.feed('friends')).posts.every((p) => p.id !== secretId), 'a friend never sees an Only me page in the feed');
  ok((await jun.social.userPosts(maya.user.id)).posts.every((p) => p.id !== secretId), 'a friend never sees it on the profile');
  const stranger = await kit.social.userPosts(maya.user.id);
  ok(stranger.posts.every((p) => p.id !== secretId) && stranger.hidden === 1, 'a stranger neither sees it nor counts it as hidden');

  const phone2 = await sessionFor('maya'); // same Google account, signed in on another phone
  const journal = await phone2.sharing.restore();
  const back = journal.find((e) => e.id === secretId);
  ok(!!back && back.vis === 'private' && back.mood === 18 && back.feelings[0] === 'tired' && back.text === secret.text, 'the second phone restores the Only me page with its mood and feelings');
  ok(back!.createdAt === secret.createdAt && typeof back!.publishedAt === 'number', 'the original writing time and the server time come back');
  ok(journal.some((e) => e.id === id), 'it restores the shared page too');
  const onPhone = await phone2.sharing.localize(back!);
  ok(onPhone.photos[0].uri.startsWith('file:///device/media/') && onPhone.photos[0].remoteKey === savedSecret.photos[0].remoteKey, 'its photo is saved onto the second phone and stays linked to the uploaded copy');

  await maya.social.deleteAccount();
  let status = 0;
  try { await maya.api.request('GET', '/me'); } catch (e) { status = (e as { status: number }).status; }
  ok(status === 401, 'after deleting the account the token is rejected');

  await t.close();
  console.log('\nALL CONTRACT CHECKS PASSED');
}, 60000);
