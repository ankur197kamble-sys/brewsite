# BrewSite

A premium, mobile-first website platform for cafés. One codebase serves many
cafés, each with its own content, dashboard and (eventually) domain.

- **Public site:** story, gallery, menu, offers and visit details, rendered on
  the server from the database, with fallbacks when content is missing.
- **Customer app** (`/app`): an installable phone app for ordering at the
  table. Customers scan a table's QR code, order from the menu, follow the
  order live and collect loyalty stamps. They pay at the counter.
- **Café dashboard** (`/dashboard`): live orders, tables and QR codes,
  loyalty stamps, café information, menu, gallery and offers. Content
  sections have create, edit, delete, reorder and publish/unpublish.
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

## Table ordering and the customer app

1. In **Dashboard → Tables & QR**, add each table (for example "Table 1",
   "Window seat"), then **Print QR codes** and stick each code on its table.
   - **Switch off** stops a table taking orders without deleting it.
   - **New QR** replaces a table's code, for example if a photo of it was
     shared. The old printed code stops working, so reprint it.
   - **Delete** removes the table but keeps its past orders.
2. A customer scans the code. The phone remembers the table for 4 hours and
   opens the menu. They add dishes, enter a name (and, optionally, a mobile
   number for loyalty stamps) and place the order. Prices always come from
   the database, never from the phone.
3. Staff keep **Dashboard → Orders** open on a tablet or laptop. New orders
   appear within a few seconds, with an optional chime, even while the tab
   is in the background. Each order moves
   **New → Preparing → Ready → Collected & paid**, or can be cancelled.
   The customer's screen follows along, and shows a large collection ticket
   when the order is ready.
4. Every collected order with a mobile number earns one stamp. Ten stamps
   earn a treat. Staff check and redeem treats in **Dashboard → Loyalty**.
   Numbers are not verified (no OTP yet), so a customer's stamp card is
   only shown on their phone after an order has been collected and paid.

Order numbers start again at **#1 every day** (café time), so they stay
short to call out. If a customer's connection drops while ordering, trying
again never places the order twice.

Spam protection, every 10 minutes: at most 6 orders from one phone, 15 per
table, and 30 from one internet connection (the café's Wi-Fi counts as one).

The customer app installs from the browser (Android: the in-app **Install**
button; iPhone: Share → Add to Home Screen). Its name and icon come from the
café's details. A small service worker only shows an offline page when there
is no connection. It never caches menus, prices or orders.

## Backups

```bash
npm run backup        # saves backups/brewsite-<date>_<time>.json
```

The backup captures every table (cafés, logins, menus, gallery, offers and
upload records) in one consistent snapshot. Login sessions are left out on
purpose. `backups/` is git-ignored because the files contain login password
hashes. Copy them somewhere private, never to GitHub. Run a backup before big
changes and about once a week.

To restore one café, for example after menu items were deleted by mistake:

```bash
npm run restore -- backups/<file>.json --cafe 1            # preview: shows what would change
npm run restore -- backups/<file>.json --cafe 1 --apply    # puts it back
```

This restores that café's details, menu, gallery and offers exactly as they
were. Logins and other cafés are not touched. A safety backup of the current
state is saved first, and everything changes in one transaction, so a failure
leaves the data as it was.
- If someone edits the dashboard while a restore runs, the restore cancels
  itself and changes nothing. Run it again.
- If the database has gained or lost columns since the backup was taken, the
  preview lists them, and `--apply` also needs `--accept-schema-changes`.

If the whole database is ever lost, create a new one, run `npm run db:push`
against it, then use `npm run restore -- <file>.json --all --apply`. `--all`
refuses to run on a database that already has data.

`npm run test:backup` proves that backups restore. It runs on a throwaway
café and a temporary schema, and needs no dev server.

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
npm test               # café, menu, offers, uploads and orders end-to-end suites
npm run test:cafe
npm run test:menu
npm run test:offers
npm run test:uploads
npm run test:orders    # tables, ordering, staff updates, loyalty, rate limits
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
src/app/app/              customer ordering app (menu, checkout, order status, stamps)
src/app/t/[token]/        where a table's QR code points
src/app/dashboard/        café dashboard
src/app/api/              API routes (auth, cafe, menu, gallery, offers, uploads,
                          tables, orders, loyalty; public/ needs no login)
src/app/db/               schema and tenant-scoped data access
src/app/lib/              validation, auth, sessions, image-host allowlist
scripts/                  admin scripts and test suites
docs/                     development notebook
```

Images may only come from hosts listed in `src/app/lib/image-hosts.ts`. The
same list drives API validation and `next/image`.

See [docs/DEVELOPMENT_NOTEBOOK.md](docs/DEVELOPMENT_NOTEBOOK.md) for the
milestone history and design decisions.
