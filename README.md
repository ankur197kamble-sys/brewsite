# BrewSite

A premium, mobile-first website platform for cafés. One codebase serves many
cafés, each with its own content, dashboard and (eventually) domain.

- **Public site:** story, gallery, menu, offers and visit details, rendered on
  the server from the database, with fallbacks when content is missing.
- **Café dashboard** (`/dashboard`): café information, menu, gallery and
  offers, each with create, edit, delete, reorder and publish/unpublish.
- **Multi-tenant by design:** every dashboard action takes the café from the
  signed-in session, never from the request.

Stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Neon Postgres ·
Drizzle ORM.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` with the database connection string (never commit it):
   ```
   DATABASE_URL=postgres://...
   ```
3. Sync the schema to the database:
   ```bash
   npm run db:push
   ```
4. Create the first café. The public homepage always shows café **#1**
   (see `src/app/lib/tenant.ts`), and the offers test suite checks it, so it
   must exist before `npm test`. On a fresh database, run this in the Neon
   SQL editor (or add a row with `npm run db:studio`) and check it returns 1:
   ```sql
   INSERT INTO cafes (name) VALUES ('Your Café') RETURNING id;
   ```
   Everything else (story, hours, photos) can then be filled in from the
   dashboard.
5. Create a dashboard login for that café:
   ```bash
   npm run create-user -- owner@example.com "a-long-password" 1
   ```
   To change a password later (e.g. a forgotten one), run the command below.
   It prompts for the new password without showing it and signs the account
   out everywhere. It writes to the shared database, so it also applies to
   the live site.
   ```bash
   npm run set-password -- owner@example.com
   ```
6. Start the app at http://localhost:3000:
   ```bash
   npm run dev
   ```

## Onboarding a café's menu

Transcribe the café's details and printed menu into a JSON file under
`onboarding/`, which is git-ignored because customer data belongs in the
database, not this public repository. The format is documented at the top of
`scripts/import-cafe.mjs`. Then:

```bash
npm run import-cafe -- 1 onboarding/my-cafe.json            # dry run: shows every change
npm run import-cafe -- 1 onboarding/my-cafe.json --apply    # writes it
```

Re-running updates items in place and never duplicates them. With
`"hideMissing": true`, items not in the file are hidden, never deleted. Mark
any price you could not read with `"published": false` and a `"note"`: it is
imported hidden, and the owner confirms it in the dashboard.

## Photo uploads (Cloudflare R2)

Owners can upload their own photos for the hero image, gallery, offers and
menu items. Photos are resized in the browser (max 2400 px, WebP/JPEG, EXIF
and GPS data stripped) and stored in Cloudflare R2. Without the settings below
the app still works, and owners can only paste image links.

1. In the Cloudflare dashboard, open **R2 Object Storage** and create a bucket
   (for example `brewsite-photos`). Cloudflare may ask for a payment method
   to enable R2, even within the free tier.
2. In the bucket's **Settings → Public access**, either enable the
   **R2.dev subdomain** (fine for testing; rate-limited) or connect a custom
   domain (recommended for production, for example `photos.yourdomain.com`).
   Copy the public URL.
3. Under **R2 → Manage API tokens**, create a token with **Object Read &
   Write** permission for that bucket only. Copy the Access Key ID and the
   Secret Access Key (shown once) and your Account ID.
4. Add these to `.env.local`. Keep the secret out of chat, git and screenshots.
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=brewsite-photos
   NEXT_PUBLIC_UPLOADS_BASE_URL=https://pub-....r2.dev
   ```
   Use just the origin (`https://host`), with no path: photos are stored at
   `<origin>/cafes/<café id>/…`.
5. Restart `npm run dev`, then run `npm run test:uploads`. With credentials
   present it stores a real photo, reads it back and deletes it.

When deploying, add the same five variables to the hosting provider.
`NEXT_PUBLIC_UPLOADS_BASE_URL` is compiled into the app, so rebuild after
changing it.

**Moving to a custom domain later:** photos already saved keep their old
address (for example the `r2.dev` one). Keep that public access switched on
and list the old origin so those photos stay valid:
```
NEXT_PUBLIC_UPLOADS_BASE_URL=https://photos.yourdomain.com
NEXT_PUBLIC_UPLOADS_LEGACY_HOSTS=https://pub-....r2.dev
```
(Several old origins can be listed, separated by commas.)

Limits: 4 MB per photo after resizing, JPEG/PNG/WebP only (checked from the
file's bytes, not its name), and 100 uploads per café per day. Image links
must be https (http links are upgraded automatically); links to the photo
bucket must point inside `/cafes/` and carry no `?query`.

## Deploying (Vercel)

1. Sign in at [vercel.com](https://vercel.com) with GitHub, then choose
   **Add New → Project** and import this repository. Next.js is detected
   automatically.
2. The project name becomes the address (`<name>.vercel.app`).
3. Under **Environment Variables**, add:
   - `DATABASE_URL`: the same value as in `.env.local`. Paste it only into
     Vercel.
   - `SITE_PREVIEW` = `true` while the café is not yet a customer: every page
     is marked `noindex` so search engines never list the demo.
   - The five R2 variables, once photo uploads are set up.
4. Click **Deploy**.

`vercel.json` pins the server functions to Singapore (`sin1`), next to the
Neon database, so each page's database queries stay in one region.

Environment variables are read at build time, so after changing one (for
example removing `SITE_PREVIEW` when the café signs up), use **Deployments →
Redeploy**.

Vercel's free Hobby plan is for non-commercial use. Move the project to Pro
before charging a café for the site.

## Tests and checks

With `npm run dev` running in another terminal:

```bash
npm test               # menu, offers and uploads end-to-end suites
npm run test:menu
npm run test:offers
npm run test:uploads
```

The suites call the real HTTP API as two throwaway `[test]` cafés, including
cross-tenant attacks, and delete everything they create. They refuse to run
against anything other than localhost.

Before merging:

```bash
npx tsc --noEmit
npx eslint .
npx next build
```

## Project layout

```
src/app/page.tsx          public homepage
src/app/dashboard/        café dashboard
src/app/api/              API routes (auth, cafe, menu, gallery, offers, uploads)
src/app/db/               schema and tenant-scoped data access
src/app/lib/              validation, auth, sessions, image-host allowlist
scripts/                  admin scripts and test suites
docs/                     development notebook
```

Images may only come from hosts listed in `src/app/lib/image-hosts.ts`. The
same list drives API validation and `next/image`.

See [docs/DEVELOPMENT_NOTEBOOK.md](docs/DEVELOPMENT_NOTEBOOK.md) for the
milestone history and design decisions.
