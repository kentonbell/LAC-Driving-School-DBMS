// Run from backend: node scripts/setup-login.mjs
// Password input is hidden; credentials never appear in command arguments.
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { neon } from '@neondatabase/serverless';
import { normalizeEmail, validEmail, validPassword } from '../../shared/email.ts';

let hidden = false;
const output = new Writable({ write(chunk, encoding, done) {
  if (!hidden) process.stdout.write(chunk, encoding);
  done();
} });
const terminal = createInterface({ input: process.stdin, output, terminal: true });
try {
  const vars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : '';
  const match = vars.match(/^\s*DATABASE_URL\s*=\s*["']?([^\r\n]+?)["']?\s*$/m);
  const url = process.env.DATABASE_URL ?? match?.[1];
  if (!url) throw Error('Missing database connection.');
  const target = (await terminal.question('Type admin for the school administrator, or an existing user ID: ')).trim();
  const email = normalizeEmail(await terminal.question('Login email: '));
  if (!validEmail(email)) throw Error('Invalid email.');
  process.stdout.write('New password (at least 12 characters; typing is hidden): ');
  hidden = true;
  const password = await terminal.question('');
  hidden = false;
  process.stdout.write('\n');
  process.stdout.write('Repeat password: ');
  hidden = true;
  const confirmation = await terminal.question('');
  hidden = false;
  process.stdout.write('\n');
  if (password !== confirmation) throw Error('Passwords do not match.');
  if (!validPassword(password)) throw Error('Invalid password length.');
  if (target !== 'admin' && !/^[1-9]\d*$/.test(target)) throw Error('Invalid user ID.');
  const sql = neon(url);
  // One statement makes administrator creation and credential assignment atomic.
  const rows = await sql`WITH created AS (
    INSERT INTO application_user(auth_provider_user_id,role)
    SELECT 'school-admin','admin' WHERE ${target}='admin'
    ON CONFLICT(auth_provider_user_id) DO NOTHING RETURNING user_id
  ), target_user AS (
    SELECT user_id FROM created UNION ALL
    SELECT user_id FROM application_user WHERE is_active AND
      ((${target}='admin' AND auth_provider_user_id='school-admin' AND role='admin')
      OR (${target}<>'admin' AND user_id::text=${target}))
  ) INSERT INTO login_credential(user_id,email,password_hash)
    SELECT user_id,${email},crypt(${password},gen_salt('bf',12)) FROM target_user
    ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,updated_at=clock_timestamp()
    RETURNING user_id`;
  if (!rows.length) throw Error('Account unavailable.');
  console.log('Login saved. You can now sign in with your email and password.');
} catch {
  // Do not echo database exceptions, which can include connection details or query values.
  hidden = false;
  console.error('\nSetup failed. Check the email, matching password (12 characters / 72 bytes maximum), database connection, login migration, and account ID. Login emails must be unique.');
  process.exitCode = 1;
} finally { terminal.close(); }
