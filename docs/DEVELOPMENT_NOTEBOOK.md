# BrewSite development notebook

A running record of every major milestone: what was built, why, how it was
verified, and what was learned. Newest milestone at the bottom. The repository
and its git history are the source of truth; this notebook explains the
reasoning behind them.

---

## Milestone history

Milestones 1–7 were built before this notebook existed. They are summarised
from the git history and the project handoff, not written up in full.

| # | Date | Commit | Milestone |
|---|------|--------|-----------|
| 0 | 2026-09-08 | `0d6b74e` | Initial Next.js project (Create Next App) |
| 1 | 2026-09-08 | `1a33180` | Premium café homepage (static data) |
| 2 | 2026-09-09 | `04f252e` | Café data moved to Neon Postgres via Drizzle |
| 3 | 2026-09-21 | `d563c1b` | Database-backed menu management |
| 4 | 2026-09-21 | `7e75271` | Authentication and tenant protection |
| 5 | 2026-09-21 | `591b4ea` | Hero image, gallery and opening hours editable |
| 6 | 2026-09-21 | `22940ef` | Premium visual and animation pass |
| 7 | 2026-09-28 | `e81e722` | Gallery and offers in dedicated tables with dashboards |
| — | 2026-09-30 | `61ee612` | PR #1 merged: all of the above reaches `main` on GitHub |
| 8 | 2026-09-30 | branch `offers-verification` | Offers verification, repeatable tests, four fixes (below) |
| 9 | 2026-09-30 | branch `photo-uploads` | Photo uploads to Cloudflare R2 |
| 10 | 2026-09-30 | branch `coffee-gruham` | First real café: Coffee Gruham onboarded; facts never faked; menu importer |

---

## Milestone 8: Offers verification and repeatable tests

### 1. Objective
Prove the offers feature works end to end (dashboard → API → database →
public homepage) with tenant isolation, and leave behind a repeatable test
suite instead of one-off manual checks.

### 2. Why
Offers were built in milestone 7, but the `offers` table was still empty, so
the public section had never rendered with real data. Earlier API and
cross-tenant testing was manual and could not be re-run. A SaaS that will host
many cafés needs isolation checks that anyone can run in one command.

### 3. Starting state
- `main` on GitHub held only the Create Next App commit. All work sat on
  `cafe-dashboard-features`, merged during this session as PR #1.
- Type-check, lint and build all passed.
- Database: 1 café, 1 user, 2 menu categories, 5 menu items, 3 gallery
  images, 0 offers.
- No automated tests existed.

### 4. Steps
1. Inspected the repository, schema, auth, tenant resolution and the offers
   code (read-only).
2. Created branch `offers-verification` from the merged `main`.
3. Wrote `scripts/test-offers.mjs` to drive the real HTTP API with two
   throwaway cafés.
4. Ran it: 76 of 77 passed. The failure was a test bug (React's `<!-- -->`
   text separators in server HTML), which was fixed in the test.
5. While reviewing, found the time-zone bug in `today()` and fixed it.
6. Browser check at 375 px (phone) and 1280 px (desktop): homepage offers
   section, dashboard list, add-offer dialog and delete confirmation. Found the
   dialog-centring bug and fixed it in all four dialogs.
7. Switched menu item images to the shared image-host allowlist and added
   live validation to the menu item dialog.
8. Moved the shared test code into `scripts/lib/harness.mjs` and added
   `scripts/test-menu.mjs`.
9. Fixed the dashboard overview, which counted gallery images from the legacy
   column, and added an offers count.
10. Re-ran everything, confirmed the database was left exactly as found, and
   ran type-check, lint and build.

### 5. Files created
- `scripts/lib/harness.mjs`: shared test helpers (throwaway tenants, login,
  checks, guaranteed cleanup, local-only guard).
- `scripts/test-offers.mjs`: 79 offers checks.
- `scripts/test-menu.mjs`: 42 menu checks.
- `docs/DEVELOPMENT_NOTEBOOK.md`: this file.

### 6. Files modified
- `src/app/lib/offers.ts`: `today()` now uses the café's time zone.
- `src/app/lib/menu.ts`: uses the shared `parseImageUrl`; the local
  scheme-only version was removed.
- `src/app/dashboard/menu/item-dialog.tsx`: host hint, inline error,
  `aria-invalid`/`aria-describedby`, and Save disabled while the link is
  invalid.
- `src/app/dashboard/confirm-dialog.tsx`, `gallery/image-dialog.tsx`,
  `menu/item-dialog.tsx`, `offers/offer-dialog.tsx`: added `m-auto`.
- `src/app/dashboard/page.tsx`: gallery count from `gallery_images`
  ("Demo gallery" when nothing is published, matching the public
  fallback), new "Offers: N of M live" card, 5-column grid on wide screens.
- `package.json`: `test`, `test:menu` and `test:offers` scripts.
- `README.md`: replaced the Create Next App boilerplate.

### 7. Important code and concepts
- **Offer visibility** has one definition, `offerStatus()` in
  `lib/offers.ts`: unpublished → draft; start date in the future →
  scheduled; end date in the past → ended; otherwise live. Dates are stored
  as `YYYY-MM-DD` strings and compared as strings, so there is no Date maths.
- **Café time zone:**
  ```ts
  export const CAFE_TIME_ZONE = "Asia/Kolkata";
  new Intl.DateTimeFormat("en-CA", { timeZone: CAFE_TIME_ZONE, ... })
  ```
  `en-CA` formats as `YYYY-MM-DD`. The same code runs on the server (public
  page) and in the browser (dashboard badges), so both always agree.
- **Test harness:** each run creates `[test] …` cafés with random-password
  users, logs in over HTTP to get a real session cookie, and in `finally`
  deletes those cafés. The foreign keys cascade to users, sessions, menu,
  gallery and offers.

### 8. Commands
```bash
npm run dev            # start the app (separate terminal)
npm test               # menu + offers suites against localhost:3000
npm run test:offers    # offers only
npm run test:menu      # menu only
npx tsc --noEmit
npx eslint .
npx next build
```

### 9. Database changes
None to the schema. The tests write only to throwaway `[test]` cafés and
remove them. The offers suite briefly inserts four `[test]` offers for café #1
(the public café) to check the homepage, and deletes them in the same run.
After every run in this session the counts matched the starting state.

### 10. Frontend changes
- All dashboard dialogs are centred instead of pinned to the top-left.
- The menu item dialog now says which image hosts are allowed and shows
  problems as the owner types.
- The dashboard overview shows real gallery and offers counts.

### 11. Backend and API changes
- Menu item create/update rejects images from hosts not on the allowlist,
  with the same message as gallery and offers.
- Offer live/scheduled/ended decisions use Indian calendar dates regardless
  of the server's time zone.

### 12. Architecture decisions
- **Tests drive HTTP, not internal functions.** This is what proves tenant
  isolation, because it goes through the session → cafeId path an attacker
  would use. It also avoids the Node `@/` alias problem: `lib/*` files import
  via `@/…`, which plain Node scripts cannot resolve.
- **No test framework added.** Plain Node scripts are enough today and add no
  dependencies. Revisit if unit tests are needed.
- **Time zone as a platform constant**, like `CURRENCY_SYMBOL`. It becomes a
  per-café column when BrewSite has a café outside India.

### 13. Security considerations
- Café B was tested attacking café A on every write path: edit, unpublish,
  move, delete, reorder with mixed ids, reorder of A's full list, adding a
  menu item to A's category, and moving its own item into A's category. All
  were refused, and A's data was verified unchanged afterwards.
- A forged `cafeId` in the request body is ignored.
- API responses never include `cafeId`.
- The test harness refuses to run against anything other than
  `localhost`/`127.0.0.1`.
- Test passwords are random per run and never printed.
- Menu images now share the allowlist, closing a gap where any host could be
  saved. That would have broken `next/image` rendering once menu photos are
  displayed.

### 14. Performance considerations
No runtime changes. `Intl.DateTimeFormat` is called once per page render.

### 15. Problems and errors
| Problem | Cause |
|---|---|
| "end date is shown" test failed | React inserts `<!-- -->` between adjacent text nodes in server HTML |
| Dialogs stuck at top-left | Tailwind v4 preflight sets `margin: 0`, removing the browser's `margin: auto` centring for modal `<dialog>` |
| Offers would start and end 5½ h late in production | `today()` used the server clock; Vercel runs on UTC |
| Overview showed the wrong gallery count | It read the legacy `cafes.gallery_images` column, not the `gallery_images` table |
| Menu accepted any image host | `lib/menu.ts` had its own URL check, predating the shared allowlist |
| Browser automation could not type into date inputs | Tool limitation with native `dd-mm-yyyy` segments. Date rules are covered by the API tests instead |

### 16. Fixes
- Test strips `<!-- -->` before matching text.
- `m-auto` added to all four `<dialog>` class lists.
- `today()` formats `new Date()` in `Asia/Kolkata` via `Intl`.
- `lib/menu.ts` imports `parseImageUrl` from `lib/image-hosts`.
- Overview reads `getGallery` and `getOffers`, using `offerStatus` for "live".

### 17. Tests
- `npm run test:menu`: **42 passed, 0 failed**
- `npm run test:offers`: **79 passed, 0 failed** (includes overview counts)
- `npx tsc --noEmit`, `npx eslint .`, `npx next build`: all pass
- Browser, manual: homepage offers section (phone and desktop), dashboard
  offers list, add offer by keyboard, delete confirmation (Cancel focused
  first, Escape cancels), centred dialogs, no horizontal scroll at 375 px.

### 18. Expected vs actual
All expected behaviour confirmed once the four bugs above were fixed.

### 19. Git checkpoint
Branch `offers-verification`:
- `2c6c9a4`: offers verification, time-zone fix, dialog centring
- a follow-up commit: menu image allowlist, overview counts, shared
  harness, menu tests, notebook, README

### 20. What it enables
`npm test` gives a safety net for every future feature. New features should
add a `scripts/test-<feature>.mjs` that uses `scripts/lib/harness.mjs`.

### 21. Lessons learned
- Build-time checks (type-check, lint, build) do not catch layout bugs. The
  dialog bug shipped because nobody opened a dialog after the Tailwind v4
  upgrade.
- Anything date-based must say whose "today" it means.
- One validator per rule. The menu's private URL check had drifted from the
  shared one.

### 22. Terminology
- **Tenant:** one café, with its users and content.
- **Tenant isolation:** a user can only ever touch their own café's rows.
- **Preflight:** Tailwind's base CSS reset.
- **Harness:** the shared setup, cleanup and assertion code the tests run on.

### 23. Project structure (relevant parts)
```
docs/DEVELOPMENT_NOTEBOOK.md
scripts/
  lib/harness.mjs          shared test harness
  test-menu.mjs            npm run test:menu
  test-offers.mjs          npm run test:offers
  create-user.mjs          npm run create-user
  backfill-gallery.mjs     npm run backfill-gallery
src/
  proxy.ts                 optimistic /dashboard gate
  app/
    page.tsx               public homepage (café #1)
    api/                   auth, cafe, menu, gallery, offers routes
    dashboard/             overview, cafe, menu, gallery, offers
    db/                    schema + tenant-scoped data access
    lib/                   validation, auth, session, tenant, image hosts
```

### 24. Next task (suggested)
1. Merge `offers-verification` into `main`.
2. Add `scripts/test-gallery.mjs` using the harness (the gallery has no
   automated tests yet).
3. Then the next product feature (reviews, SEO or QR menu).

---

## Milestone 9: Photo uploads (Cloudflare R2)

### 1. Objective
Let café owners upload their own photos for the hero image, gallery, offers
and menu items, instead of being limited to Unsplash links.

### 2. Why
A real café needs its own photography, and the project rules require real or
licensed photos for a live café. Until now the only allowed image source was
`images.unsplash.com`, which blocked the first real customer. R2 was chosen
over Vercel Blob because it charges nothing for image traffic (egress), which
keeps per-café cost predictable against the ₹5,000/month target.

### 3. Starting state
Branch `photo-uploads` from `offers-verification` (not yet merged). Every
image field was a URL input validated against a one-host allowlist.

### 4. Steps
1. Read the Next 16 docs for Route Handler `formData()` and
   `images.remotePatterns` (`pathname`, `search`).
2. Installed `aws4fetch` (MIT, no dependencies), Cloudflare's recommended R2
   signer, instead of the much larger AWS SDK.
3. Extended the image allowlist with an optional upload bucket restricted to
   `/cafes/`.
4. Added the `uploads` table, `db/uploads.ts`, `lib/r2.ts`, `lib/uploads.ts`
   and `POST /api/uploads`.
5. Built `<ImageUpload>` and added it to all four image fields.
6. `npm run db:push`: created the `uploads` table (additive only).
7. Wrote `scripts/test-uploads.mjs`, ran all suites, a browser check and both
   builds.

### 5. Files created
- `src/app/api/uploads/route.ts`: upload endpoint
- `src/app/lib/r2.ts`: server-only R2 client (`putObject`, `deleteObject`)
- `src/app/lib/uploads.ts`: limits and byte-signature file-type detection
- `src/app/db/uploads.ts`: `recordUpload`, `countUploadsSince`
- `src/app/dashboard/image-upload.tsx`: the "Upload photo" control
- `scripts/test-uploads.mjs`: 22 checks without R2 (more with R2)

### 6. Files modified
- `src/app/lib/image-hosts.ts`: `IMAGE_SOURCES` (hosts plus optional path
  prefix), `UPLOADS_BASE_URL`, `uploadsEnabled`, `IMAGE_SOURCE_HINT`
- `next.config.ts`: remote patterns built from `IMAGE_SOURCES`; the bucket
  gets `pathname: "/cafes/**"` and `search: ""`
- `src/app/db/schema.ts`: `uploads` table
- The four image fields: café hero, gallery, offer and menu item dialogs
- `scripts/lib/harness.mjs`: `testCafeIds()`
- `package.json`: `aws4fetch`, `test:uploads`, `npm test` runs all three
- `README.md`: R2 setup guide

### 7. Important code and concepts
- **Upload flow:** the browser decodes the photo, resizes it to at most
  2400 px, and re-encodes it as WebP (or JPEG where WebP encoding is
  unsupported, e.g. Safari). It then POSTs multipart data to `/api/uploads`.
  The server checks auth → daily limit → size → real file type → storage
  configured, stores the object as `cafes/<sessionCafeId>/<uuid>.<ext>`,
  records it, and returns the public URL. That URL goes into the existing
  image field, so no other API changed.
- **File-type sniffing:** the first bytes decide the type (JPEG `FF D8 FF`,
  PNG signature, `RIFF….WEBP`). The client's file name and MIME type are
  ignored, so SVG with script, HTML or GIF are refused with 415.
- **Keys come only from the server:** the café id comes from the session and
  the name is a random UUID, so a café cannot write into another café's
  folder or overwrite an existing photo.

### 8. Commands
```bash
npm install aws4fetch
npm run db:push
npm run test:uploads
```

### 9. Database changes
New table `uploads` (id, cafe_id → cafes ON DELETE CASCADE, key unique, url,
content_type, size_bytes, created_at), with an index on
`(cafe_id, created_at)` for the daily-limit count. No existing tables changed;
row counts were verified unchanged.

### 10. Frontend changes
Every image field has an **Upload photo** button with "Preparing photo…" and
"Uploading…" states, errors announced via `role="alert"`, a field-specific
`aria-label`, and a new hint text. Nothing is shown when uploads are not
configured.

### 11. Backend and API changes
`POST /api/uploads` → 201 `{ id, url }`; 400 no/empty file or not multipart;
401 not signed in; 413 over 4 MB; 415 not JPEG/PNG/WebP; 429 over 100 per
day; 502 storage error; 503 not configured.

### 12. Architecture decisions
- **Server-proxied upload instead of presigned direct-to-R2.** This needs no
  bucket CORS setup, lets the server inspect every byte, and stays under
  Vercel's ~4.5 MB body limit because the browser shrinks photos first.
- **URLs stay the stored value.** Existing columns did not change; the
  uploads table only records ownership.
- **No automatic deletion of replaced photos yet** (see Known limitations).

### 13. Security considerations
- R2 secrets are server-only (`lib/r2.ts`); only the public base URL is
  exposed to the browser.
- `next/image` proxies only `/cafes/**` on the bucket, with no query string.
  Verified: `/private/…`, `?v=1` and other hosts return 400.
- SVG is refused (stored XSS risk); types are sniffed, not trusted.
- Photos are re-encoded in the browser, which strips EXIF/GPS. The server
  does not strip EXIF itself (a request made outside the dashboard could keep
  it); acceptable because only the café's own signed-in owner can upload.
- Per-café daily limit caps storage abuse.

### 14. Performance considerations
Photos typically go from several MB to a few hundred KB before upload (test:
3000×2000 JPEG, 692 KB → 2400×1600 WebP, 139 KB). Objects are served with
`Cache-Control: public, max-age=31536000, immutable` because keys never
change.

### 15. Problems and errors
| Problem | Fix |
|---|---|
| Test cleanup could not tell which cafés were test cafés | Harness now exposes `testCafeIds()` |
| Browser pane hidden, keyboard input would not reach it | Signed in via the login API from inside the page, then drove the dialog with DOM events |

### 16. Fixes
See the table above.

### 17. Tests
- `npm run test:uploads`: **21 passed** (R2 not configured). Covers
  sniffing, 401, 400s, 415 for SVG/HTML/GIF disguised as images, 413 at
  1 byte over and far over, 503, the 429 daily limit, and that the limit is
  per café.
- With a placeholder bucket URL: gallery accepts `/cafes/…` on the bucket,
  rejects other paths and hosts (6 checks), and `next/image` patterns were
  verified as above.
- Browser: the upload button appears in the gallery dialog and hero field; a
  3000×2000 photo was resized and sent as WebP; the server's 503 message is
  shown; a non-photo file shows a readable error; the button is
  keyboard-reachable.
- Regression: menu 42/42, offers 79/79; `tsc`, `eslint`, and `next build`
  both with and without the bucket URL.
- **Not yet run:** the real R2 round trip (store → public URL → gallery →
  `next/image` → delete). It is written and runs automatically once R2
  credentials are in `.env.local`.

### 18. Expected vs actual
Everything testable without R2 credentials behaves as designed. The R2
signing and storage path is unverified until credentials exist.

### 19. Git checkpoint
Branch `photo-uploads`, commit "Add photo uploads to Cloudflare R2".

### 20. What it enables
Onboarding a real café with its own photography. The `uploads` table also
enables per-café storage reporting (billing) and cleanup when a café leaves.

### 21. Lessons learned
- Keep the stored value unchanged (a URL) and add capability around it; no
  existing API had to change.
- Test up to the external dependency, and make the suite upgrade itself once
  credentials appear.

### 22. Terminology
- **R2:** Cloudflare's S3-compatible object storage.
- **Egress:** data transferred out to visitors; R2 does not charge for it.
- **Object key:** the path of a file inside a bucket.
- **Magic bytes / sniffing:** identifying a file type from its first bytes.

### 23. Known limitations and follow-ups
- Replaced or deleted photos stay in R2 (orphans). Storage is cheap, and the
  `uploads` table makes a later cleanup script straightforward.
- A café could paste another café's public photo URL. The photos are public
  anyway; can be tightened by checking the `cafes/<id>/` prefix against the
  session.
- `r2.dev` URLs are rate-limited; use a custom domain before launch.

### Milestone 9, part 2: independent review and fixes

Before calling the branch complete, five independent reviewers each examined
one dimension of the unmerged diff: upload server, allowlist and config,
client UI and accessibility, tenant and data safety, and whether the tests
and docs are accurate. A separate skeptic then tried to refute every finding.
Result: 23 candidates, 21 confirmed. They deduplicate to 14 distinct issues,
all fixed. Two were refuted: menu items with old non-allowlisted images
(none exist), and a claimed "high" risk of test offers being left on café #1
(the cleanup runs in `finally`; Ctrl+C is now handled too).

| # | Issue | Fix |
|---|---|---|
| 1 | Upload callback spread a stale draft: edits made during an upload were lost | Dialog `onChange` is now the parent's `setDraft`; uploads apply with `setDraft(current => …)` |
| 2 | Save was possible mid-upload; closing a dialog mid-upload could deliver the URL to a later dialog | `ImageUpload` reports `onBusyChange`, Save waits ("Waiting for photo..."), and unmounting aborts the upload |
| 3 | Daily limit was check-then-act, so parallel requests could exceed it | Reserve the row, then count; roll back on 429 or storage failure. It can hit the limit exactly but never exceed it |
| 4 | A chunked body (no Content-Length) was buffered in full before the size check | The byte-counting stream stops reading past 4 MB + 64 KB and returns 413 |
| 5 | The validator accepted bucket URLs with `?query` and `http:` links that `next/image` rejects | `IMAGE_SOURCES` carries `noQuery`, which drives both the validator and `remotePatterns`; http is upgraded to https |
| 6 | Moving from r2.dev to a custom domain would break earlier photos | `NEXT_PUBLIC_UPLOADS_LEGACY_HOSTS` keeps old bucket hosts valid |
| 7 | The Safari JPEG fallback turned transparent pixels black | Paint white behind the image before encoding JPEG |
| 8 | Overview said "Demo gallery" when legacy photos were really shown | Mirrors the full fallback chain ("N older photos") |
| 9 | Upload button: status linked to the hidden input; accessible name did not start with the visible text; success not announced | `aria-describedby` on the button, hidden input `aria-hidden`, sr-only suffix, "Photo uploaded…" status |
| 10 | A failing cleanup step skipped test-café deletion | Each step isolated; cafés are always deleted last; Ctrl+C runs cleanup |
| 11 | Cross-tenant "move" tests could not fail (the target was already at the edge) | Move functions return `moved`/`edge`/`not_found`; cross-tenant moves now get 404 and are tested in both directions |
| 12 | README never created café #1 | New setup step with SQL |
| 13 | Upload key test could fail by chance (`includes("999")`) | Exact `^/cafes/<id>/<uuid>.png$` match |
| 14 | README layout omitted the uploads route | Updated |

**API change:** moving a gallery image, offer, menu item or category that
does not exist, or belongs to another café, now returns **404** instead of
400. 400 now means only "already first/last". The dashboard shows the
message either way.

**Verification:**
- Suites: menu 46, offers 82, uploads 22 (new: chunked-body 413, http
  upgrade, query rejection, cross-tenant move 404s).
- With a placeholder bucket plus a legacy host: 13 allowlist and
  `next/image` agreement checks.
- In the browser: alt text typed during an upload survives; Save stays
  disabled until the photo arrives; closing mid-upload leaves the next dialog
  clean; success is announced; the forced Safari JPEG path produces white,
  not black.
- `tsc`, `eslint`, and `next build` with uploads off and on.
- Database verified unchanged afterwards.

### 24. Next task
1. Owner: create the R2 bucket and token (README), add the `.env.local`
   values, and run `npm run test:uploads` for the full round trip.
2. Merge `offers-verification`, then `photo-uploads`.
3. Then deployment to Vercel with a real domain.

---

## Milestone 10: First real café, Coffee Gruham

### Objective
Replace the demo content of café #1 with the first real customer, Coffee
Gruham (Katrap, Badlapur E), using photos of their printed menu. Fix every
place the platform would have shown demo data as if it were theirs.

### Starting state
Branch `coffee-gruham`, from `photo-uploads`. Café #1 held demo content: name
"Brewsite Neon Test 2", a London address, made-up hours, "Since 2018", a
placeholder phone number, and 5 demo menu items.

### Data applied (café #1)
- **From the menu card:**
  - name: Coffee Gruham
  - highlights: "Fresh Brews · Handpicked Bakery · Comfort Bites"
  - headline: the motto "Coffee एवं परम् सुखम्"
  - address: Shop No. 4, Gite Chowk, Vedant Kalp Apt, Opp. Hitachi ATM,
    Katrap, Badlapur (E)
  - phone number (as printed)
  - Instagram: @coffeegruham
- **Maps link:** a Google Maps search built from the printed address.
- **Story text:** written only from facts on the card, including "run by
  Brewbean Ventures". The owner can edit it in the dashboard.
- **Deliberately left empty, because the card does not state them:**
  - opening hours
  - founding year
  - WhatsApp (the printed number may not be on WhatsApp)
  - minimum order (the value was hidden by glare)
- **Menu:** 12 categories and 77 items in the order printed. 66 are live.
  - 11 were imported **hidden** because glare made their prices unreadable:
    Chicken Salad Bowl, six veg momos, both Volcano Kiss mocktails, and both
    ice teas (entered at ₹0).
  - The 5 demo items were hidden, not deleted. "Coffee & Espresso" and
    "Pastries" were kept for the café's real coffee and bakery items; that
    page was not legible in the photos.
- **Backup:** the pre-import row and menu are saved in
  `onboarding/backup-cafe1-before-coffee-gruham.json` (git-ignored).

### Platform changes
1. **Facts are never faked.** Once a café has its own record, the founding
   year, address, hours, phone, WhatsApp, Instagram and maps link come only
   from that record, and are hidden when empty. Only presentational fields
   (headline, story, photos) still fall back to demo content.
   - `getSiteCafe` now returns a `SiteCafe` type with those fields nullable.
2. **Dashboard trap removed.** The Café Information form used to pre-fill
   empty hours and address with demo values, so one Save published them. It
   now loads them empty. The API stores an empty address as empty, and a
   founding year of 0 or an implausible year as unknown (the site showed
   "Since 0" before).
3. **New `highlights` field:** the line above the hero headline, replacing
   the hard-coded "Specialty coffee". There is a new dashboard field for it.
   The API only changes it when the field is sent.
4. **Contact:** a new **Call** button (`tel:`). The WhatsApp button only
   shows when a WhatsApp number exists, and `wa.me` links strip non-digits.
   The footer shows "© year café name".
5. **Page title and description** come from the café, via
   `generateMetadata`. The café is loaded once per request through React
   `cache`.
6. **Menus of any size.** Menus with more than 16 items get:
   - compact rows
   - two balanced columns on desktop (CSS columns)
   - a sticky, horizontally scrollable category bar with 44 px tap targets

   The result: 7,252 px → 5,560 px on a phone, and 3,258 px on desktop.
   `<main>` changed from `overflow-hidden` to `overflow-x-clip`, because
   `overflow: hidden` creates a scroll container and stopped the bar from
   sticking.
7. **`scripts/import-cafe.mjs`** (`npm run import-cafe`): a reusable
   onboarding importer.
   - It shows a dry run by default and writes only with `--apply`.
   - It validates everything and scopes every query to the target café.
   - Re-running matches items by name, so it is idempotent.
   - With `hideMissing` it hides items instead of deleting them.
8. **`scripts/test-cafe.mjs`** (19 checks): highlights, founding-year
   handling, empty facts never replaced by demo data, and cross-café saves.

### Also in this branch
A second independent review of the part-2 fixes confirmed 4 low-severity
issues, all fixed in commit `2e3ac0d`:
- an oversized WebP now falls back to JPEG
- the upload reservation is released on every failure, and R2 calls time out
- a move that races another change returns 409, not 404
- the harness handles Ctrl+C by stopping the run, then cleaning up once

### Tests
- `npm test`: café 19, menu 46, offers 82, uploads 22, **169 checks**, all
  passing.
- `tsc`, `eslint` and `next build` pass.
- Browser, at 375 px and 1280 px:
  - The hero shows the highlights and the Devanagari motto.
  - The menu jump links work, and the category bar sticks and releases.
  - Nothing overflows sideways.
  - The Visit section shows the address, Directions and Call.
  - The dashboard form loads empty facts empty, and saves them without
    demo data.

### For the owner to confirm
1. The 11 hidden prices, then click **Show** in the dashboard.
2. Opening hours, founding year, and whether their phone number is on WhatsApp.
3. Their exact Google Maps business link, and the minimum order value.
4. The coffee and bakery page: a clear photo is needed.
5. Real photos for the hero and gallery, which are still demo images. They
   can be uploaded once R2 is configured.
6. The spelling of the motto, and the sandwich prices, which were small
   print.
