import { canRead } from './visibility';

describe('canRead', () => {
  const base = { viewerId: 'v', authorId: 'a', isFriend: false };
  it('authors always read their own pages', () => {
    expect(canRead({ ...base, viewerId: 'a', vis: 'friends' })).toBe(true);
  });
  it('anyone signed in reads public pages', () => {
    expect(canRead({ ...base, vis: 'public' })).toBe(true);
  });
  it('friends-only pages need an accepted friendship', () => {
    expect(canRead({ ...base, vis: 'friends' })).toBe(false);
    expect(canRead({ ...base, vis: 'friends', isFriend: true })).toBe(true);
  });
});
