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
4. Create a dashboard login for a café:
   ```bash
   npm run create-user -- owner@example.com "a-long-password" 1
   ```
5. Start the app at http://localhost:3000:
   ```bash
   npm run dev
   ```

## Tests and checks

With `npm run dev` running in another terminal:

```bash
npm test               # menu + offers end-to-end suites
npm run test:menu
npm run test:offers
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
src/app/api/              API routes (auth, cafe, menu, gallery, offers)
src/app/db/               schema and tenant-scoped data access
src/app/lib/              validation, auth, sessions, image-host allowlist
scripts/                  admin scripts and test suites
docs/                     development notebook
```

Images may only come from hosts listed in `src/app/lib/image-hosts.ts`. The
same list drives API validation and `next/image`.

See [docs/DEVELOPMENT_NOTEBOOK.md](docs/DEVELOPMENT_NOTEBOOK.md) for the
milestone history and design decisions.
