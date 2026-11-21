#!/bin/sh
set -eu
# Bind changes require container recreation; reject stale/missing mounts before
# starting PostgreSQL instead of repeatedly starting and shutting down its data.
for script in /bootstrap/init-databases.sh /bootstrap/init-queue.sh; do
  if [ ! -f "$script" ] || [ ! -r "$script" ]; then
    echo "Required PostgreSQL bootstrap script is missing: $script. Recreate the DEV container with pnpm stack:up; preserve its data volume." >&2
    exit 1
  fi
done
rm -f /tmp/modulon-postgres-ready
/usr/local/bin/docker-entrypoint.sh "$@" &
server=$!
stop() { kill -TERM "$server" 2>/dev/null || true; wait "$server" || true; }
trap 'stop; exit 0' INT TERM
attempt=0
until pg_isready -h 127.0.0.1 -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; do
  if ! kill -0 "$server" 2>/dev/null || [ "$attempt" -ge 120 ]; then
    echo 'PostgreSQL did not become ready for database bootstrap' >&2
    stop; exit 1
  fi
  attempt=$((attempt + 1)); sleep 1
done
if ! PGHOST=127.0.0.1 sh /bootstrap/init-databases.sh; then stop; exit 1; fi
if ! PGHOST=127.0.0.1 sh /bootstrap/init-queue.sh; then stop; exit 1; fi
touch /tmp/modulon-postgres-ready
wait "$server"
