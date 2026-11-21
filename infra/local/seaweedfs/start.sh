#!/bin/sh
set -eu
rm -f /tmp/modulon-seaweed-ready
node /bootstrap/configure.mjs
weed "$@" &
server=$!
bootstrap=''
stop() {
  if [ -n "$bootstrap" ]; then kill -TERM "$bootstrap" 2>/dev/null || true; fi
  kill -TERM "$server" 2>/dev/null || true
  wait "$server" || true
}
trap 'stop; exit 0' INT TERM
node /bootstrap/init-bucket.mjs &
bootstrap=$!
if ! wait "$bootstrap"; then stop; exit 1; fi
bootstrap=''
touch /tmp/modulon-seaweed-ready
wait "$server"
