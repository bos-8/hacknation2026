#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'check-taxonomy.py' "$@"

root="${1:-.}"
docs="$root/docs"
errors=0

if [ ! -f "$docs/0000-overview.md" ]; then
  echo "Missing docs/0000-overview.md" >&2
  errors=1
fi

if [ -d "$docs" ]; then
  for file in "$docs"/*.md; do
    [ -e "$file" ] || continue
    name=$(basename "$file")
    if ! printf '%s\n' "$name" | LC_ALL=C grep -Eq '^([0-9]{4}-[a-z0-9][a-z0-9-]*|README|AGENTS|CLAUDE|CONTRIBUTING|SECURITY|CHANGELOG|LICENSE)(\.[a-z]{2})?\.md$'; then
      echo "Invalid docs filename: $name" >&2
      errors=1
    fi
  done
fi

[ "$errors" -eq 0 ] || exit 1
echo "RepoRoute taxonomy check passed."
