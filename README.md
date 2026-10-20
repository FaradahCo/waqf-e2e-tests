# waqf-e2e-tests

Playwright end-to-end tests for the Swaqif admin panel
(`../elwaqf-elnamy-admin-fronted`), driven against a disposable local backend
(`../waqfnami`) running in Docker. Nothing here talks to production or any
shared dev environment.

## One-time setup

```bash
npm install
npx playwright install chromium   # first run only
cp .env.example .env              # defaults already work locally
```

## Running the suite

```bash
npm run backend:up      # builds + starts MySQL + Laravel in Docker, seeds fixtures (slow the first time)
npm test                 # runs Playwright; auto-starts the Vite dev server against the local backend
npm run report            # open the last HTML report
npm run backend:down      # stop the backend when done
```

`npm run backend:reset` wipes the database volume and reseeds from scratch if
fixtures get into a bad state.

## What the backend fixtures look like

`waqfnami/database/seeders/E2ETestAdminSeeder.php` creates a disposable admin
login (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` in `.env`, defaults
`e2e-admin@waqf.test` / `E2eTest#12345`) — separate from the real hardcoded
credentials in `CreateAdminSeeder.php`, which this suite never touches.

`waqfnami/database/seeders/E2EFixtureSeeder.php` seeds a small, deterministic
set of business data (clients, providers, services, consultations, discount
codes, static pages, etc.) keyed by human-readable natural keys (emails,
codes, slugs) rather than database ids, so tests can look them up the same
way a human would in the UI.

## Layout

- `playwright.config.ts` — starts the frontend (`vite --mode e2e`) and points
  it at the local backend via `VITE_API_URL`.
- `e2e/setup/auth.setup.ts` — logs in once via the real UI, saves
  `e2e/.auth/admin.json` (gitignored) for all other tests to reuse.
- `e2e/pages/` — page objects (`LoginPage`, `AppLayout`, `ListPage` — the
  latter wraps the app's shared `CustomTable`/`CustomFilter` components used
  by nearly every list screen).
- `e2e/tests/` — spec files, one folder per admin module.
