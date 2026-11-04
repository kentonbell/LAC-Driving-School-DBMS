# Database demonstration

Use a dedicated demo database. Apply the migrations in [hosting setup](hosting.md), provision the first administrator, and set the Worker's `ENABLE_DEMO_DATA=true`.

1. Sign in as admin and open **Demo Data → Populate database**. This creates fictional students, a driver, an instructor, bookable windows, package history, a payment, and a pending day-off request, and 50 extra weekday bookings in November 2026. The dates, services, and participants vary when you reseed.
2. In **Students** and **Staff**, open a record and generate a one-day access code. Use separate browser windows for the different roles.
3. As Alex, review the six-lesson package, book an available lesson, and submit a late cancellation or reschedule request for the seeded lesson. Check **My Bookings**. As admin, review the request, then check the student's inbox.
4. Request a group session with Taylor. As admin, select Sam as an additional participant when approving. Verify both student schedules and Taylor's roster. After a session ends, record per-student attendance and feedback, and check what each student can see.
5. As Morgan, open **Weekly Schedule** and submit a day-off request. Approve it as admin and verify that Morgan no longer has slots that day.
6. As admin, record a payment and review the outstanding balance and reports. If Gemini is configured, try the student and instructor assistants with an explicit date or selected student.
7. Return to **Demo Data → Empty database**. Administrator access remains. Populate again to start fresh.

The app tracks payments received elsewhere. Reminders are in-app and downloadable calendar events. The prototype does not connect to Square or send email, SMS, or push notifications.

To refresh an existing hosted demo, run [`demo.sql`](../backend/database/demo.sql) in the Neon SQL Editor on the dedicated demo database. This updates the demo functions and keeps the existing records. When you are ready to replace the fictional records, use **Admin → Demo Data → Empty database**, then **Populate database**. Administrator access is preserved.
