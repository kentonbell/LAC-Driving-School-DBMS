#!/usr/bin/env bash
# Run on macOS. Only the SHA-256 digest goes into the SQL clipboard.
set -euo pipefail
admin_code=$(openssl rand -hex 32)
admin_digest=$(printf '%s' "$admin_code" | shasum -a 256 | cut -d ' ' -f 1)

pbcopy <<SQL
WITH new_admin AS (
  INSERT INTO application_user (auth_provider_user_id, role)
  VALUES ('school-admin', 'admin')
  ON CONFLICT (auth_provider_user_id) DO NOTHING
  RETURNING user_id
), active_admin AS (
  SELECT user_id FROM new_admin
  UNION ALL
  SELECT user_id FROM application_user
  WHERE auth_provider_user_id = 'school-admin' AND role = 'admin' AND is_active
)
INSERT INTO portal_access (token_digest, user_id, expires_at)
SELECT '$admin_digest', user_id, now() + interval '1 day'
FROM active_admin
RETURNING user_id, expires_at;
SQL

printf '\nSQL copied. Your private school admin access code:\n%s\n' "$admin_code"
