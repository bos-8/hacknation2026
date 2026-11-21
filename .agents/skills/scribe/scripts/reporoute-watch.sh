#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'reporoute-watch.py' "$@"

root="${1:-.}"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

sh "$script_dir/reporoute-preflight.sh" "$root"

echo "Scribe watch active: documentation-aware guidance is on for this chat."
echo "Start at docs/0000-overview.md, route through XX00 and optional XXX0, then load only the needed concrete leaf."
echo "Watch is guidance only; it does not edit files or start subagents."
