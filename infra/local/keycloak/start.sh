#!/bin/bash
set -eu
rm -f /tmp/formiq-keycloak-ready
/opt/keycloak/bin/kc.sh "$@" &
server=$!
bootstrap=''
stop() {
  if [ -n "$bootstrap" ]; then kill -TERM "$bootstrap" 2>/dev/null || true; fi
  kill -TERM "$server" 2>/dev/null || true
  wait "$server" || true
}
trap 'stop; exit 0' INT TERM
node /opt/formiq/bootstrap/configure.mjs &
bootstrap=$!
if ! wait "$bootstrap"; then stop; exit 1; fi
bootstrap=''
touch /tmp/formiq-keycloak-ready
wait "$server"
