#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node dist/database/migrate.js
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  node dist/database/seed.js
fi

exec node dist/main.js
