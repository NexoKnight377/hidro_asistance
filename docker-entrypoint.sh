#!/bin/sh
set -eu

echo "[entrypoint] Waiting for Postgres to accept connections..."
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

i=0
while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  i=$((i+1))
  if [ $i -gt 60 ]; then
    echo "[entrypoint] ERROR: Could not reach Postgres at $DB_HOST:$DB_PORT after 60s"
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] Postgres is up."
echo "[entrypoint] Applying database schema (drizzle-kit push --force)..."
npx drizzle-kit push --force

echo "[entrypoint] Starting Next.js server..."
exec "$@"