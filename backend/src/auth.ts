import type { SQL } from './index';
import { normalizeEmail, validEmail, validPassword } from '../../shared/email';

export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));

export async function login(sql: SQL, data: Record<string, unknown>, ip: string) {
  const email = typeof data.email === 'string' ? normalizeEmail(data.email) : '';
  const password = typeof data.password === 'string' ? data.password : '';
  if (!validEmail(email)) throw new AuthError(400, 'Enter a valid email, such as name@example.com.');
  if (!validPassword(password)) throw new AuthError(401, 'Email or password is incorrect.');
  // Count before checking credentials, including unknown accounts. PostgreSQL serializes increments.
  const keys = [await digest('email:' + email), await digest('ip:' + ip)];
  const attempts = await sql`INSERT INTO login_attempt(key,attempts)
    SELECT key,1 FROM unnest(${keys}::text[]) AS key ORDER BY key
    ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN login_attempt.window_start < now()-interval '15 minutes' THEN 1 ELSE login_attempt.attempts+1 END,
      window_start=CASE WHEN login_attempt.window_start < now()-interval '15 minutes' THEN now() ELSE login_attempt.window_start END
    RETURNING key,attempts`;
  if (attempts.some(r => Number(r.attempts) > (r.key === keys[0] ? 10 : 50)))
    throw new AuthError(429, 'Too many sign-in attempts. Try again in 15 minutes.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenDigest = await digest(token);
  // A dummy salted hash also performs password work for an unknown address.
  const rows = await sql`WITH candidate AS MATERIALIZED (
      SELECT c.*,u.role,u.student_id,u.instructor_id,
        coalesce(i.staff_role,u.role) effective_role,
        coalesce(s.first_name||' '||s.last_name,i.first_name||' '||i.last_name,'School administrator') name
      FROM login_credential c JOIN application_user u USING(user_id)
      LEFT JOIN student s USING(student_id) LEFT JOIN instructor i USING(instructor_id)
      WHERE c.email=${email} AND u.is_active AND coalesce(s.status,'active')='active' AND coalesce(i.status,'active')='active'
    ), checked AS MATERIALIZED (
      SELECT crypt(${password},coalesce((SELECT password_hash FROM candidate),gen_salt('bf',12))) hash
    ), session AS (
      INSERT INTO login_session(token_digest,user_id,credential_version,expires_at)
      SELECT ${tokenDigest},user_id,updated_at,now()+interval '8 hours' FROM candidate,checked WHERE password_hash=hash
      RETURNING user_id
    ) SELECT c.user_id::text id,c.effective_role role,c.name FROM candidate c JOIN session USING(user_id)`;
  if (!rows.length) throw new AuthError(401, 'Email or password is incorrect.');
  return { token, user: rows[0] };
}

export async function setLogin(sql: SQL, userId: string, emailValue: unknown, passwordValue: unknown) {
  const email = typeof emailValue === 'string' ? normalizeEmail(emailValue) : '';
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  if (!validEmail(email)) throw new AuthError(400, 'Enter a valid login email.');
  if (!validPassword(password)) throw new AuthError(400, 'Use at least 12 characters and at most 72 bytes for the password.');
  try {
    const rows = await sql`INSERT INTO login_credential(user_id,email,password_hash)
      SELECT user_id,${email},crypt(${password},gen_salt('bf',12)) FROM application_user WHERE user_id=${userId}::bigint AND is_active
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,updated_at=clock_timestamp()
      RETURNING user_id`;
    if (!rows.length) throw new AuthError(400, 'Account unavailable.');
  } catch (error) {
    if ((error as {code?:string}).code === '23505') throw new AuthError(409, 'That login email is already assigned to an account.');
    throw error;
  }
}
