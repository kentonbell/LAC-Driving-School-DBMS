# L.A.C. Driving School

A public driving school site and a CMPT 339 operations prototype. The public pages use the client's original artwork and list the services, prices, hours, pickup points and policies from the supplied project materials.

## Run the application

Use Node 24. Set up Neon by applying `backend/database/schema.sql`, `backend/database/portal.sql`, `backend/database/workspace.sql`, then `backend/database/catalog.sql`. For an existing database with the first two files already applied, start at `workspace.sql`.

Configure `backend/.dev.vars` with `DATABASE_URL` and `FRONTEND_ORIGIN=http://localhost:5173`. To enable the signed-in assistant, also set `GEMINI_API_KEY` and `GEMINI_MODEL`. In `frontend/.env.local`, set `VITE_API_URL=http://localhost:8787`.

Run `npm ci` and `npm run dev` in both `backend` and `frontend` in separate terminals. Open the frontend URL and sign in with a school access code. The browser keeps the code in memory until sign-out or reload.

[Hosting and first administrator setup](docs/hosting.md) · [Demo walkthrough](docs/demo.md) · [Database design](backend/database/README.md) · [Implementation checklist](plan.md)

For a dedicated class demo, also apply `backend/database/demo.sql` and set `ENABLE_DEMO_DATA=true` on the Worker. **Admin → Demo Data** can populate or empty the database, and provides both SQL scripts. Emptying preserves administrator accounts and credentials. The demo uses the same database, API, and role dashboards as the application.

## Verify

```sh
(cd frontend && npm test && npm run lint && npm run build)
(cd backend && npx --no-install tsc --noEmit && npm test -- --run --config vitest.unit.config.mts)
```

For full Worker runtime tests on a machine that permits localhost listeners, run `npm test -- --run` in `backend`. The PWA precaches static assets; live records and API responses are not cached. Use `npm run preview` after building to verify installation.

Run [workspace-tests.sql](backend/database/workspace-tests.sql) against a fresh disposable database after installing the demo migration.
