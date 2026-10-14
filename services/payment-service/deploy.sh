#!/usr/bin/env bash
set -euo pipefail
# Private process launcher. No migrations, token generation, or environment printing.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ ! -f .env ]]; then
  echo "Missing services/payment-service/.env; configure it on the server first." >&2
  exit 1
fi
if [[ "$(stat -c '%a' .env)" != "600" ]]; then
  echo "Set permissions first: chmod 600 services/payment-service/.env" >&2
  exit 1
fi
npm ci --omit=dev
node -e 'require("./src/config").loadConfig(); console.log("Payment config validated")'
exec node src/server.js
