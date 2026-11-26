-- Contact emails may be shared; each login email must be unique.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE login_credential (
  user_id bigint PRIMARY KEY REFERENCES application_user ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  password_hash text NOT NULL CHECK (password_hash LIKE '$2a$12$%' AND length(password_hash)=60),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE login_session (
  token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  user_id bigint NOT NULL REFERENCES login_credential ON DELETE CASCADE,
  credential_version timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX login_session_user ON login_session(user_id);
CREATE TABLE login_attempt (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_start timestamptz NOT NULL DEFAULT now()
);
COMMIT;
