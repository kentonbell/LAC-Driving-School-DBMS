-- Apply after schema.sql. Access codes are random 256-bit credentials; store
-- SHA-256 digests only. Rotate or revoke credentials by replacing/deleting rows.
BEGIN;
CREATE TABLE portal_access (
  token_digest text PRIMARY KEY CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  user_id bigint NOT NULL REFERENCES application_user ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE portal_chat_quota (
  user_id bigint NOT NULL REFERENCES application_user ON DELETE CASCADE,
  local_day date NOT NULL,
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, local_day)
);
ALTER TABLE instructor ADD COLUMN staff_role text NOT NULL DEFAULT 'instructor'
  CHECK (staff_role IN ('driver','instructor'));
COMMIT;
