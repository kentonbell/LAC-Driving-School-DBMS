# L.A.C. Driving School

A public driving school site and a CMPT 339 operations prototype. The public pages use the client's original artwork and list the services, prices, hours, pickup points and policies from the supplied project materials.

## Run the demo

Use Node 22.18+ (Node 24 recommended).

```sh
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Select **Sign in**, then Student, Driver, Instructor or Admin Demo. Each role goes to its own dashboard. Demo changes are shared between tabs on the same browser origin and stored locally; role selection is per tab. Use fictional data only. Clearing this site's local and session storage resets the demo.

[Demo walkthrough and feature coverage](docs/demo.md) · [Implementation checklist](plan.md) · [Database design](database/README.md)

## Connect a development backend

Use a fresh test database. Apply `database/schema.sql` and `database/portal.sql` in that order, then optionally apply `database/seed.sql` for fictional data. The SQL draft and demo catalog have separate seed data. Add future availability windows for any instructors who should be bookable. Never apply demo seed data to production.

The Worker uses `DATABASE_URL` and, optionally, `GEMINI_API_KEY` as secrets; set `GEMINI_MODEL` to a model enabled on the chosen Gemini account. Set `FRONTEND_ORIGIN` to the exact frontend origin. For local development use the Worker's ignored `api/.dev.vars`, then run `npm run dev` in `api`. Set `VITE_API_URL=http://localhost:8787` in `frontend/.env.local` and restart Vite. For Pages, use `frontend` as the root and `dist` as the build output.

Live sign-in uses school-issued, expiring access codes. An operator provisions the appropriate `application_user` row, generates a code with `openssl rand -hex 32`, and inserts its SHA-256 digest (of the 64-character string without a newline) and expiry into `portal_access`. Share the original code through a secure channel. Deleting its digest revokes it. Driver accounts use an instructor profile with `staff_role = 'driver'`. The browser keeps the live code in memory until sign-out or reload.

The live path supports sign-in, scoped schedules, package balances, standard student booking and the read-only Gemini assistant. Demo operations beyond those features do not write to PostgreSQL. See the coverage matrix before connecting real data.

## Verify

```sh
(cd frontend && npm test && npm run lint && npm run build)
(cd api && npx --no-install tsc && npm test -- --run --config vitest.unit.config.mts)
```

For full Worker runtime tests on a machine that permits localhost listeners, run `npm test -- --run` in `api`. The PWA precaches static assets; live records and API responses are not cached. Use `npm run preview` after building to verify installation.
