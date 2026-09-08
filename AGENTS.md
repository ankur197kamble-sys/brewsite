<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Brewsite project rulebook

## Purpose

Brewsite is a premium, mobile-first café website platform. It begins with one
café, but its architecture must support multiple cafés with different branding,
content, and domains without duplicating the underlying application.

## Core principles

- Use TypeScript throughout the application.
- Prioritize performance, accessibility, SEO, responsive design, security, and
  reusable components.
- Build in stages: planning, design system, public website, data layer,
  dashboard, analytics, testing, and deployment.
- Prefer simple, maintainable solutions over unnecessary dependencies or
  abstraction.
- Treat mobile as the primary experience; verify layouts at 320px, 375px,
  390px, 414px, tablet, and desktop widths.
- Use animation to strengthen storytelling, never at the expense of loading
  speed, usability, or reduced-motion preferences.

## Product scope

- The public site includes the café story, menu, featured items, gallery,
  offers, reviews, opening hours, directions, and contact calls to action.
- The eventual dashboard manages café details, menu items, gallery images,
  offers, opening hours, analytics, and QR-code menu links.
- Keep café content and branding configurable. Do not permanently hard-code a
  specific café's identity into reusable platform code.

## Engineering standards

- Use semantic HTML, keyboard-accessible controls, descriptive labels, and
  appropriate image alt text.
- Keep client-side JavaScript minimal. Use responsive, optimized images and
  lazy-load non-critical media.
- Keep components focused and reusable. Avoid duplicating page-section markup.
- Add validation to all future user-controlled input and use authorization for
  every dashboard action.
- Keep secrets in environment variables only. Never commit credentials, API
  keys, tokens, production URLs with embedded credentials, or private user data.
- Do not modify production data or deployment configuration without explicit
  approval.
- When multi-café support is introduced, enforce strict tenant isolation in
  every data access path.

## Quality checks

Before considering a feature complete, run the relevant checks:

1. TypeScript and lint checks.
2. Production build.
3. Responsive visual review.
4. Keyboard and accessibility review.
5. Basic SEO and performance review for public pages.

## Working approach

- Explain the proposed change in plain language before making a significant
  product or architecture decision.
- Keep changes small, reviewable, and committed with clear messages.
- Use real café photography or properly licensed assets for a live café. AI
  imagery is allowed only for concepts and placeholders, and must be reviewed
  before publication.
