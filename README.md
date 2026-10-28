# journ-al-be

Backend for the Journal app: NestJS 11 + Drizzle ORM + Neon Postgres + Cloudinary. See [docs/DESIGN.md](docs/DESIGN.md) for the API and rules.

The whole journal is saved to the user's account so it follows them to any phone, including Only me pages with their mood and feelings. Only me pages can be read by their author alone, and mood and feelings are never shown to anyone else.

## Run it locally

1. **Neon database (free):** sign up at neon.tech → create a project → *Connect* → copy the **pooled** connection string (host contains `-pooler`, ends with `?sslmode=require`).
2. **Cloudinary (free plan):** sign up at cloudinary.com → *Settings* → *API Keys* → copy the **API environment variable** (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`). Nothing else to configure: files are stored as `authenticated` assets and served through signed URLs.
3. **Config:** `cp .env.example .env` and fill it in (`DATABASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `CLOUDINARY_URL`). `GOOGLE_WEB_CLIENT_ID` must equal the Web client ID the app uses. Generate `JWT_SECRET` with `openssl rand -base64 48`. The `dev` and `db:migrate` scripts read `.env` themselves.
4. **Install, migrate, run:**
   ```bash
   npm install
   npm run db:migrate               # creates the tables in Neon and lists them
   npm run dev                      # http://localhost:3000/health
   ```

## Test

```bash
npm test          # Jest; runs the real migrations on in-process Postgres (PGlite), no Neon needed
npm run typecheck
```

## Contract check against the mobile client

`npm run test:contract` runs the real mobile API code (`../journ-al/mobile/src/api`, `src/social`) against this backend with an in-process database: sign-in, friend requests, publishing with photo/voice upload, feeds, reactions, privacy rules, unpublish, re-share and account deletion. It needs the `journ-al` repo checked out next to this one.

## Change the schema

Edit `src/db/schema.ts`, then `npm run db:generate` (creates a SQL file in `drizzle/`), commit it, and run `npm run db:migrate` against Neon.

## Deploy later (free options)

Any Node host works. For Render/Fly/Railway: build `npm ci && npm run build`, start `node dist/src/main.js`, run `npm run db:migrate:prod` once per release, and set the env vars from `.env.example`. A `Dockerfile` is included. Free tiers sleep when idle, so the first request after a pause is slow.

## Using it from the app

Set the app's API base URL, send the Google ID token to `POST /auth/google`, then send `Authorization: Bearer <token>` on every call. Photos and voice notes: `POST /media/upload-url`, then `POST` a multipart form to the returned `uploadUrl` with every entry of `fields` plus the file under `fileField`, then reference the `key` in `PUT /posts/:id`.

## Known limits

- Upload size isn't capped by our signature. The Cloudinary free plan limits files itself (about 10 MB per image, 100 MB per video/audio); to restrict formats or sizes further, use a signed upload preset in the Cloudinary dashboard.
- A signed upload can name any resource type, so a signed-in user could store a non-media file under your Cloudinary account. Fine for friends-only use; tighten before opening it up.
- Signed delivery URLs don't expire (expiring URLs need a paid Cloudinary plan). Anyone who was given a URL can open that file until the page is unpublished, which deletes it and purges the CDN.
- Uploads that never get attached to a page stay in Cloudinary (a periodic cleanup is future work).
- No rate limiting or moderation yet.
