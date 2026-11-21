#!/bin/sh
# Forward argv to the shared runtime dispatcher; never evaluate argument text.
set -eu
runtime_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
skillpack_probe() {
    "$1" -I -S -c 'import sys; sys.exit(sys.version_info < (3, 11))' >/dev/null 2>&1 &
    _probe_pid=$!
    (
        sleep 3 &
        _sleep_pid=$!
        trap 'kill "$_sleep_pid" 2>/dev/null || true; exit 0' TERM INT
        wait "$_sleep_pid" || exit 0
        kill -KILL "$_probe_pid" 2>/dev/null || true
    ) </dev/null >/dev/null 2>&1 &
    _guard_pid=$!
    if wait "$_probe_pid" 2>/dev/null; then _probe_status=0; else _probe_status=$?; fi
    kill "$_guard_pid" 2>/dev/null || true
    wait "$_guard_pid" 2>/dev/null || true
    return "$_probe_status"
}
for candidate in "${SKILLPACK_PYTHON:-}" python3 python; do
    [ -n "$candidate" ] || continue
    if skillpack_probe "$candidate"; then
        exec "$candidate" "$runtime_dir/_runtime.py" "$@"
    fi
done
printf '%s\n' 'Python 3.11+ is required. Set SKILLPACK_PYTHON to its executable path.' >&2
exit 3
