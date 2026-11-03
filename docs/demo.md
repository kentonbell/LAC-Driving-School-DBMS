# Demonstration and handoff

The demo workflow borrows from CareRide's role-switching walkthrough and in-app inbox, adapted to driving lessons. It uses fictional accounts and local browser storage. It does not use Square or send email, SMS or push notifications.

1. Open Home, review lessons and pricing, and select Sign in → Student Demo. Check the package balance. Book a standard session, selecting an available time, pickup and payment option. Review the booking and check My Bookings.
2. Reschedule or cancel the seeded lesson, which is less than 48 hours away. The request appears in My Bookings. Choose Switch demo account → Admin Demo, open Approval Requests, record a decision, then switch back to see the result in the student inbox.
3. As admin, record a package purchase and a payment. Check the student profile and Package balances report. Changing package prices will not rewrite a recorded purchase.
4. As Instructor Demo, select the seeded past lesson under Student Feedback. Record attendance, feedback, a practice-test score and a private note. Mark feedback as visible and confirm the student sees it in My Progress. Private notes remain in the teaching view.
5. As Driver Demo, browse the dashboard month calendar or the Schedule page and submit a day-off request on an unbooked date. Approve it as admin, then verify the driver is unavailable for that date in student booking.
6. Ask the student assistant for package balance and availability. Enter an exact date when prompted. Ask the instructor assistant for student history before and after explicitly selecting an assigned student.

Use Previous, Today, and Next to explore the calendar. The agenda opens on today. Select a date in the calendar to see only that day’s lesson tabs. The first lesson opens automatically with details and directions in Apple Maps or Google Maps. The browser demo includes lessons across three months and two additional sessions every weekday in November 2026, plus sample package payments, requests, attendance, and feedback. To reload the sample data, choose **Reset demo data** below **Pick-up directions and my location** on any demo workspace page and confirm that you want to replace your saved demo changes.

| Workflow | Browser demo | Worker / PostgreSQL |
| --- | --- | --- |
| Public pricing, hours, designated pickups, policies and read-only school assistant | Available | Public content uses bundled catalog; Worker has a school-information tool for signed-in accounts |
| Four dashboards and role routing | Sample accounts | Access-code sign-in and role-scoped schedule; student balance |
| Standard student booking | Review and save | Availability from instructor windows and database-backed booking; exclusion constraints prevent overlapping times |
| Staff and student records, packages and payments | Admin forms and archival | Core tables and report views exist; remaining mutations need live endpoints |
| Late changes, schedule exceptions and group approvals | Role-specific forms, queue, inbox | Live request and group workflows still need implementation |
| Attendance, feedback and practice-test scores | Per participant; private and student-visible fields | Feedback table exists; live forms and attendance/score endpoints still need implementation |
| Reports | Six report types | Six SQL views; staff dashboard currently shows schedule |
| Assistant | Local intent matching and scoped sample records | Gemini allowlist, server-scoped data, daily quota, no write tools |
| Reminders and pickup directions | In-app inbox, calendar export and optional browser location | Directions available on the public site; no live reminder delivery |

The 48-hour cutoff, 12-month package validity, approved locations, and completed/no-show entitlement consumption are provisional implementation rules. Review client decisions for student access, group sessions, outside-hours bookings, fee collection, payment handling and the relationship with Square before any live rollout. The demo surfaces the $30 late rescheduling fee as a policy reminder; it does not automatically post a charge. Browser data isolation is for demonstration only. Real access is enforced by the Worker.
