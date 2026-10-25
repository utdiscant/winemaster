# Wine Master (WSET training)

A spaced-repetition quiz for wine knowledge, live at **https://vinblinder.dk/wset-training**.

Questions are shared by everyone; each user's progress is scheduled with the SM-2 algorithm. There
are four question types: single choice, multi-select, free text, and map (click the region, or name
the region shown).

## How it's built

- **Frontend**: React, Vite, Tailwind, shadcn/ui, wouter, TanStack Query, Leaflet (`client/`)
- **Backend**: a Cloudflare Worker using Hono (`worker/`)
- **Database**: Cloudflare D1 (SQLite) through Drizzle (`shared/schema.ts`, migrations in `migrations/`)
- **Login**: email and password. Passwords are hashed with PBKDF2; sessions live in D1 and in an
  HttpOnly cookie scoped to `/wset-training`.

Everything is served from the `/wset-training` path. Vite builds into `dist/wset-training`, so the
built files sit at that path for the Worker's static assets. Requests under `/wset-training/api/` go
to the API, and any other path that isn't a file gets the app's `index.html`.

The rest of vinblinder.dk is a different Worker (wine-guessr, attached as a custom domain). This
Worker is attached with routes on `vinblinder.dk/wset-training*` and `www.vinblinder.dk/wset-training*`,
which run in front of it for this path only.

## Admins

Accounts whose email is listed in `ADMIN_EMAILS` in `wrangler.jsonc` (comma-separated) become admins
when they sign up or log in. Admins can upload questions as JSON, edit and delete questions, and
delete users.

## Developing

```bash
npm install
npm run dev
```

This applies migrations to a local D1 database and runs `wrangler dev` (API on port 8787) alongside
Vite. Open http://localhost:5173/wset-training/.

To be an admin locally, sign up with an email in `ADMIN_EMAILS`, or start the Worker with
`wrangler dev --var ADMIN_EMAILS:you@example.com`.

Other scripts:

- `npm run check`: type-check the app and the Worker
- `npm run db:generate`: after changing `shared/schema.ts`, write a new migration
- `npm run cf-typegen`: after changing `wrangler.jsonc`, regenerate the Worker's `Env` types

## Deploying

```bash
npm run deploy
```

This builds the app, applies any new migrations to the production D1 database, and deploys the
Worker. You need to be logged in with `npx wrangler login`.
