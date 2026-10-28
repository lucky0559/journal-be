# Journal backend: design and plan

NestJS 11 + Drizzle ORM + Neon Postgres. Consumed by the Journal React Native app (`../journ-al/mobile`), which today uses `SharingGateway` and `AuthGateway` stubs and sample feed data.

## Principles
- **The whole journal lives in the account**, so it follows the user to any phone: every page is saved, including Only me ones with their mood and feelings, photos and voice notes. Flipping a page to Only me is an ordinary update (`vis: 'private'`); nothing is deleted. `DELETE /posts/:id` really deletes a page and its media.
- **Only me pages and the mood and feelings are the author's alone.** Private pages are readable by their author only (not even friends), never appear in a feed or on a profile, and are not counted in a profile's "hidden" total. Mood and feelings are returned only to the author, even on a public page.
- Visibility is enforced on the server for every read (feed, profile, single post, reactions, media URLs).
- The client generates post ids (UUID) so publish is idempotent (`PUT /posts/:id`).
- Media bytes go straight to Cloudinary (free plan) as `authenticated` assets through a signed multipart upload the API issues; the API only stores keys and hands out signed delivery URLs to people allowed to see the post. Deleting a page deletes its files and purges the CDN.

## Data model (Postgres)
- `users(id uuid, google_sub unique, email, name, given_name, photo, bio, created_at)`
- `posts(id uuid, author_id, date, time, vis 'private'|'friends'|'public', mood int null, feelings jsonb, prompt, text, stickers jsonb, photos jsonb[keys], voices jsonb[{key,seconds}], created_at, updated_at)`. `created_at` is the phone's original writing time, set when the page is first stored; `updated_at` is the server clock the app compares versions with.
- `friendships(requester_id, addressee_id, status 'pending'|'accepted', created_at)` one row per pair, either direction
- `reactions(post_id, user_id, kind 'hug'|'same')`
- `media(key, owner_id, kind 'photo'|'voice', content_type, created_at)` so a post can only reference the author's own uploads

## API (JSON, `Authorization: Bearer <app JWT>` except /health and /auth/google)
| Method & path | Purpose |
|---|---|
| `POST /auth/google` `{idToken}` | Verify Google ID token (audience = web client id), upsert user, return `{token, user}` |
| `GET /me`, `PATCH /me {bio}`, `DELETE /me` | Own profile; delete account and everything it owns |
| `GET /users/:id` | Profile + `friendState` (`none`/`requested`/`incoming`/`friends`) + counts |
| `GET /users/:id/posts` | Posts the viewer may read + `hidden` count (friends-only pages) |
| `PUT /posts/:id` | Save or update a page of any visibility (`private`, `friends`, `public`) with its mood and feelings (author-only fields) |
| `DELETE /posts/:id` | Delete the page and its media (author only, idempotent) |
| `GET /me/posts?limit=&before=` | My whole journal, every visibility, with mood and feelings; how another phone restores it |
| `GET /feed?tab=friends\|public&before=&limit=` | Feed with author, reaction counts, own reactions, media URLs |
| `PUT/DELETE /posts/:id/reactions/:kind` | Add/remove `hug`/`same` (only on posts you can read) |
| `GET /friends`, `GET /friends/requests` | Friends; incoming requests |
| `POST /friends/requests {userId}` | Send request (auto-accepts if they already asked you) |
| `DELETE /friends/requests/:userId` | Cancel your outgoing request |
| `POST /friends/requests/:userId/accept` / `decline` | Answer an incoming request |
| `DELETE /friends/:userId` | Unfriend |
| `POST /media/upload-url {kind, contentType}` | Signed multipart upload slot `{key, uploadUrl, method:'POST', fields, fileField}` |
| `GET /health` | Liveness |

## Visibility rules
- Can read a post: author, or `public`, or `friends` and the viewer is an accepted friend of the author. `private`: author only.
- Friends tab: posts by accepted friends (their Friends and Public pages). Public tab: every public post.
- Profile: public pages plus friends-only pages if the viewer is a friend; the rest of the friends-only pages is a `hidden` count. Private pages are never listed or counted for anyone but their author.

## Test strategy
Jest. Services and HTTP routes run against real Postgres semantics through in-process PGlite using the same Drizzle migrations; Google verification and object storage are faked behind interfaces.

## Out of scope
Push notifications, blocking/reporting, moderation, rate limiting beyond a basic throttle, search by email.
