# Database demonstration

Use a dedicated demo database. Apply the migrations in [hosting setup](hosting.md), provision the first administrator, and set the Worker's `ENABLE_DEMO_DATA=true`.

1. Sign in as admin and open **Demo Data → Populate database**. This creates fictional students, a driver, an instructor, bookable windows, package history, a payment, and a pending day-off request.
2. In **Students** and **Staff**, open a record and generate a one-day access code. Use separate browser windows for the different roles.
3. As Alex, review the six-lesson package, book an available lesson, and submit a late cancellation or reschedule request for the seeded lesson. Check **My Bookings**. As admin, review the request, then check the student's inbox.
4. Request a group session with Taylor. As admin, select Sam as an additional participant when approving. Verify both student schedules and Taylor's roster. After a session ends, record per-student attendance and feedback, and check what each student can see.
5. As Morgan, open **Weekly Schedule** and submit a day-off request. Approve it as admin and verify that Morgan no longer has slots that day.
6. As admin, record a payment and review the outstanding balance and reports. If Gemini is configured, try the student and instructor assistants with an explicit date or selected student.
7. Return to **Demo Data → Empty database**. Administrator access remains. Populate again to start fresh.

The app tracks payments received elsewhere. Reminders are in-app and downloadable calendar events. The prototype does not connect to Square or send email, SMS, or push notifications.
