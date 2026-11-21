#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'check-mermaid.py' "$@"

root="${1:-.}"
docs="$root/docs"

if [ ! -d "$docs" ] || ! grep -R "^\`\`\`mermaid" "$docs" >/dev/null 2>&1; then
  echo "No Mermaid blocks found; skipped."
  exit 0
fi

echo "Mermaid blocks found. Use --strict-mermaid with validation tools for syntax checks."
