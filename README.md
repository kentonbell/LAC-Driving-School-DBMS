# L.A.C. Driving School <img src="frontend/public/brand/logo.png" alt="" width="42">

[![MIT License](https://badgen.net/badge/license/MIT/blue)](LICENSE)
![Stage: Prototype](https://badgen.net/badge/stage/prototype/blue)
![Course: CMPT 339](https://badgen.net/badge/course/CMPT%20339/green)

<img src="frontend/public/brand/lac.jpg" alt="L.A.C. Driving School artwork featuring a learner car" width="560">

**A clearer road from the first booking to a confident driver.**

L.A.C. Driving School brings lesson booking, student progress, staff schedules, and school administration into one shared application. Students can plan their next lesson, teaching staff can follow each learner's progress, and administrators can keep daily operations moving.

Developed as a **CMPT 339 database management project**, this prototype pairs a public website for a Langley, BC driving school with four connected role dashboards. The public pages use the client's original artwork and the services, prices, hours, pickup points, and policies from the supplied project materials.

## Learning to drive takes coordination.

A lesson involves more than an available time. A student needs the right service, a pickup location, and a usable package balance. Staff need to know who they are teaching and when. The school needs a clear record of bookings, changes, attendance, and payments.

L.A.C. puts those details in one place, with a PostgreSQL database connecting the people, lessons, and records behind each booking.

## Find a lesson. Plan the next step.

The public website introduces assessment sessions, in-car lessons, Class 4 Restricted preparation, road test packages, and vehicle rentals. Visitors can compare lesson and package prices, check school hours and policies, and find pickup points across Metro Vancouver.

After signing in with a school-issued access code, students can choose a service, check availability, and book a session. Their workspace keeps upcoming bookings, package balances, attendance, and progress within reach. Cancellation and rescheduling requests follow the school's approval workflow when required.

## People at the heart of every lesson

| Who | Their part in the school day |
| --- | --- |
| Students | Book sessions, follow upcoming lessons, check package balances, and review progress and feedback. |
| Drivers | Review weekly schedules, request days off, and record student feedback. |
| Instructors | Manage teaching schedules, record attendance, and track feedback and practice-test scores. |
| Administrators | Coordinate bookings and approvals, manage student and staff records, and review packages, payments, and reports. |

Each workspace shows the records and actions available to that role. The dashboards share the same API and database, so an approved request becomes part of the school's working schedule.

## Keep the lesson and the learning connected.

Teaching staff can move from their schedule to attendance and student feedback. Group-session requests let an administrator review the proposed session and add participants, while attendance and feedback remain linked to each learner.

For administrators, booking changes and day-off requests appear alongside the records needed to review them. Package history, recorded payments, and reports help staff follow both the learning and the business side of the school.

The prototype records payments received elsewhere. Online payment processing, including Square integration, is outside its current scope.

## Support that travels with you

<img src="frontend/public/brand/map.jpg" alt="A model car on a paper map, used in the public website" width="760">

Pickup locations include directions links to help students plan their journey. In-app reminders and downloadable calendar events help them keep track of their next lesson, and the installable web app provides a home-screen entry point on supported devices.

An optional Gemini-powered assistant answers questions about school information and records available to the signed-in account, such as upcoming lessons, package balances, or teaching schedules. It requires separate API configuration.

Calendar downloads are exported reminders. The prototype does not send email, SMS, or push notifications. The app precaches static assets; live records and API responses are not cached for offline use.

## Walk through a school day

Use a **dedicated demo database with fictional records** to explore the connected workflows:

1. **Prepare:** sign in as an administrator and populate the database from **Demo Data**. Generate separate one-day access codes for the demo students and staff.
2. **Book:** sign in as a student, review a package balance, book an available lesson, and submit a booking-change request.
3. **Coordinate:** approve requests as an administrator, arrange a group session, and review the updated student and staff schedules.
4. **Follow through:** record attendance and feedback, review payments and reports, then empty the demo database when finished. Administrator accounts and credentials are preserved.

The demo uses the application's database, API, and role dashboards. Follow the [demo walkthrough](docs/demo.md) for the full sequence.

This remains a course prototype. Hosted integration, concurrent booking attempts, and device installation still need staging verification. Production rules, account provisioning, and approved data require client confirmation before launch; see the [implementation checklist](plan.md).

## Built around a shared database

| Part | Technology and purpose |
| --- | --- |
| Frontend | React, TypeScript, Vite, and Tailwind CSS for the public site and role dashboards. |
| API | A TypeScript Cloudflare Worker for access-code authentication and role-scoped operations. |
| Database | Neon PostgreSQL for lessons, availability, packages, approvals, attendance, and payment records. |
| Assistant | Optional Gemini integration for questions about school information and permitted records. |

Database constraints protect relationships, package capacity, and individual student and instructor time slots. The API applies account permissions and coordinates workspace operations. See the [database design](backend/database/README.md) for the schema, workflow rules, and validation details.

## Run the application

Use **Node 24** and a Neon PostgreSQL database.

1. Apply these SQL files **in order**: [schema.sql](backend/database/schema.sql), [portal.sql](backend/database/portal.sql), [workspace.sql](backend/database/workspace.sql), then [catalog.sql](backend/database/catalog.sql). For an existing database with the first two already applied, start at `workspace.sql`.
2. Configure `backend/.dev.vars`:

   ```dotenv
   DATABASE_URL=your_neon_connection_string
   FRONTEND_ORIGIN=http://localhost:5173
   ```

   To enable the signed-in assistant, also set `GEMINI_API_KEY` and `GEMINI_MODEL`.

3. Configure `frontend/.env.local`:

   ```dotenv
   VITE_API_URL=http://localhost:8787
   ```

4. In separate terminals, install dependencies and start each application:

   ```sh
   cd backend
   npm ci
   npm run dev
   ```

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

5. Open the frontend URL and sign in with a school access code. Follow [hosting and first administrator setup](docs/hosting.md) to provision the first account. The browser keeps the code in memory until sign-out or reload.

For a class demo, also apply [demo.sql](backend/database/demo.sql) to the dedicated demo database and set `ENABLE_DEMO_DATA=true` on the Worker. **Admin → Demo Data** can populate or empty that database and provides both SQL scripts.

## Contribution guidance

Contributions can include student and staff usability feedback, accessibility improvements, documentation, design, and software development. Open an issue describing the need and proposed outcome, or submit a focused pull request explaining the change and how it was checked.

For contributors working on the application:

- Find the public site and dashboards in `frontend/`, and the API and database code in `backend/`.
- Consult the [implementation checklist](plan.md), [database design](backend/database/README.md), and [backend instructions](backend/AGENTS.md).
- Use fictional records for demonstrations and keep credentials and personal information out of commits.
- Run checks appropriate to the change. The application checks are:

  ```sh
  (cd frontend && npm test && npm run lint && npm run build)
  (cd backend && npx --no-install tsc --noEmit && npm test -- --run --config vitest.unit.config.mts)
  ```

For full Worker runtime tests on a machine that permits localhost listeners, run `npm test -- --run` in `backend`. Run [workspace-tests.sql](backend/database/workspace-tests.sql) against a fresh disposable database after installing the demo migration. Use `npm run preview` in `frontend` after building to verify app installation.

See the [MIT license](LICENSE) for reuse terms.
