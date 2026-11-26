#!/usr/bin/env bash
# Compatibility entry point: administrator provisioning now uses email/password.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/setup-login.mjs
