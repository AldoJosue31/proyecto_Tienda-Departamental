#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node dist/database/migrate.js
fi

exec node dist/main.js
