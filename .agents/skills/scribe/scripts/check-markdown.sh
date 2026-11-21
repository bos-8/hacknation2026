#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'check-markdown.py' "$@"

root="${1:-.}"
docs="$root/docs"
errors=0

[ -d "$docs" ] || {
  echo "RepoRoute Markdown check passed."
  exit 0
}

for file in "$docs"/*.md; do
  [ -e "$file" ] || continue
  count=$(grep -o '```' "$file" 2>/dev/null | wc -l | tr -d ' ')
  if [ $((count % 2)) -ne 0 ]; then
    echo "Unclosed code fence: $(basename "$file")" >&2
    errors=1
  fi
  if grep -Eq '^#+[[:space:]]*$' "$file"; then
    echo "Empty heading: $(basename "$file")" >&2
    errors=1
  fi
done

[ "$errors" -eq 0 ] || exit 1
echo "RepoRoute Markdown check passed."
