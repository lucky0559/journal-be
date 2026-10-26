# journ-al-be

Backend for the Journal app: NestJS 11 + Drizzle ORM + Neon Postgres + Cloudflare R2. See [docs/DESIGN.md](docs/DESIGN.md) for the API and rules.

Private pages never reach this server; only pages set to Friends or Public are published. Mood and feelings are never uploaded.

## Run it locally

1. **Neon database (free):** sign up at neon.tech → create a project → *Connect* → copy the **pooled** connection string (host contains `-pooler`, ends with `?sslmode=require`).
2. **R2 bucket (free tier):** Cloudflare dashboard → R2 → create bucket (private) → *Manage R2 API tokens* → create a token with **Object Read & Write** on that bucket. Note the bucket name, access key id, secret and the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`.
3. **Config:** `cp .env.example .env` and fill it in. `GOOGLE_WEB_CLIENT_ID` must equal the Web client ID the app uses. Generate `JWT_SECRET` with `openssl rand -base64 48`.
4. **Install, migrate, run:**
   ```bash
   npm install
   set -a; source .env; set +a      # load the env vars into your shell
   npm run db:migrate               # creates the tables in Neon
   npm run dev                      # http://localhost:3000/health
   ```

## Test

```bash
npm test          # Jest; runs the real migrations on in-process Postgres (PGlite), no Neon needed
npm run typecheck
```

## Change the schema

Edit `src/db/schema.ts`, then `npm run db:generate` (creates a SQL file in `drizzle/`), commit it, and run `npm run db:migrate` against Neon.

## Deploy later (free options)

Any Node host works. For Render/Fly/Railway: build `npm ci && npm run build`, start `node dist/src/main.js`, run `npm run db:migrate:prod` once per release, and set the env vars from `.env.example`. A `Dockerfile` is included. Free tiers sleep when idle, so the first request after a pause is slow.

## Using it from the app

Set the app's API base URL, send the Google ID token to `POST /auth/google`, then send `Authorization: Bearer <token>` on every call. Photos and voice notes: `POST /media/upload-url`, `PUT` the bytes to the returned `uploadUrl` with the returned `Content-Type` header, then reference the `key` in `PUT /posts/:id`.

## Known limits

- Upload size isn't capped by the presigned URL; add a bucket lifecycle rule or an R2 size policy before opening this up.
- Uploads that never get attached to a page stay in the bucket (a periodic cleanup is future work).
- No rate limiting or moderation yet.
