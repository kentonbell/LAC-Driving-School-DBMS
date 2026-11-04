# Project progress

Updated November 3, 2026.

## Live deployment

- The public site and school sign-in are working on the [frontend Worker](https://lac.kentonbell.workers.dev).
- The API runs on the separate [backend Worker](https://lac-backend.kentonbell.workers.dev/api/catalog). The repository now uses `backend/` for the Worker, with its PostgreSQL schema and demo scripts under `backend/database/`.
- The frontend build uses `VITE_API_URL` set to the backend Worker origin. The backend has `DATABASE_URL` stored as an encrypted secret, `FRONTEND_ORIGIN` set to the frontend origin, and `ENABLE_DEMO_DATA=true` for the demo.
- Cloudflare Workers Builds is the GitHub-connected publishing path. The legacy Cloudflare Pages deployment workflow is manual in the repository. See [hosting setup](hosting.md) for build and deployment settings.
- Neon agent skills are installed for development. The enabled Neon plugin includes an MCP server, and its OAuth connection was last unverified.

## Application and database

- The public site includes service and package pricing, hours, pickup information, policies, and a link to the school portal. The frontend includes PWA support.
- Admins can issue one-day school access codes to students and staff. Students can view packages, book lessons, and request changes. Staff can view schedules, request time off, and record attendance and feedback.
- The admin workspace includes approval queues, group sessions, student and staff records, payment tracking, and reports. Reminders appear in the portal and can be downloaded as calendar events.
- Neon Postgres stores the catalog, bookings, package balances, payments, and role-specific records. Database constraints protect package entitlement and prevent overlapping lessons.
- The demo seeder includes the original walkthrough fixtures plus 50 randomly selected weekday bookings across November 2026. See [the demo walkthrough](demo.md) for how to refresh the hosted demo.

## Still to verify

- Gemini assistant behavior on the hosted deployment when configured.
- PWA installation on target devices and simultaneous booking requests against Neon.
- Client sign-off on package expiry, cancellation rules, and production readiness.
