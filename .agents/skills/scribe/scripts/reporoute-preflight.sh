#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'reporoute-preflight.py' "$@"

root="${1:-.}"
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

for check in check-taxonomy.sh check-links.sh check-markdown.sh check-mermaid.sh; do
  sh "$script_dir/$check" "$root"
done

echo "RepoRoute preflight passed. Route through 0000 -> XX00 -> [XXX0 ->] XXXx."
