export type PostVis = 'private' | 'friends' | 'public';

/** A page is readable by its author, by anyone if public, and by accepted friends if friends-only. Private pages: author only. */
export function canRead(a: { viewerId: string; authorId: string; vis: PostVis; isFriend: boolean }): boolean {
  if (a.viewerId === a.authorId) return true;
  if (a.vis === 'private') return false;
  if (a.vis === 'public') return true;
  return a.isFriend;
}
