# Email and password login

The login form replaces school access codes. Each existing application account has a separate, unique login email; student/staff contact emails are unchanged. There is no public registration, automatic email verification, or emailed password recovery. The school provisions accounts and resets passwords.

## Install

1. For a new database, apply `schema.sql`, `portal.sql`, `workspace.sql`, `catalog.sql`, then `login.sql`, from `backend/database`, in that order. Existing databases with the first four installed need only `login.sql`. Do not rerun the original migrations.
2. In `backend/.dev.vars`, set `DATABASE_URL` and `FRONTEND_ORIGIN=http://localhost:5173`. Set `VITE_API_URL=http://localhost:8787` in `frontend/.env.local`.
3. From `backend`, run `node scripts/setup-login.mjs`. Enter `admin`, the administrator's email, and a unique password of at least 12 characters. Passwords may contain spaces and are limited to 72 UTF-8 bytes to avoid bcrypt truncation. The script hides password input and asks for confirmation. It requires the login migration and backend dependencies.
4. Start both apps using `npm run dev` in their respective folders. Open `/login` on the frontend and sign in.
5. As admin, create or open a student/staff record, then use **Set / reset login**. Assign a unique email and password and share them securely. For an administrator reset, run the script again; an existing application's numeric user ID can also be supplied instead of `admin`.

Deploy both app components after the migration. Do not deploy only the new form against the old backend. The old `portal_access` table is retained for migration safety, but the new backend never authenticates its codes. The historical bootstrap script now starts email/password setup.

## Behavior

- Invalid email structure gets a clear message. Known domain typos such as `gmial.com`, `gmailcom`, and `.con` produce optional suggestions. Custom domains remain allowed; no address is silently corrected. Format validation does not verify ownership or mailbox existence.
- Passwords use PostgreSQL pgcrypto bcrypt at cost 12 with random salts. Account lookup and role checks happen on the server. Failed login responses do not disclose whether an account exists.
- Successful sign-in returns a random 256-bit bearer session. Only its SHA-256 digest is stored. Sessions expire after eight hours; the browser holds the token in memory and signing out revokes it. Reload requires signing in again.
- Changing a login changes its credential version, immediately invalidating all earlier sessions. Archived application users, students, and staff cannot sign in or continue an existing session.
- Login attempts are limited in shared PostgreSQL state to 10 per email and 50 per IP per 15-minute window. Failed attempts count too. Local development without Cloudflare's IP header shares one IP bucket.

## Verify after installation

Sign in with the administrator, provision a student login, then sign in as the student in a separate browser. Confirm that the student cannot use admin actions. Check wrong-password rejection, optional email suggestions, sign-out, and session invalidation after password reset. Archive an account and check that its session stops working.

Run the frontend tests, lint and build, plus backend TypeScript and `npm test -- --run --config vitest.unit.config.mts`. Unit tests validate email/password handling and login service branches. Real PostgreSQL integration and hosted sign-in must also be checked after applying the migration; mocked tests do not prove database behavior.

Expired session and attempt rows can be cleaned periodically with:

```sql
DELETE FROM login_session WHERE expires_at < now();
DELETE FROM login_attempt WHERE window_start < now() - interval '1 day';
```

Never put passwords or `.dev.vars` into Git or paste them into chat. Use HTTPS for hosted frontend and backend connections.
