#!/usr/bin/env sh
set -eu
_scribe_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
. "$_scribe_dir/_strict-options.sh"
scribe_strict 'check-links.py' "$@"

root="${1:-.}"
docs="$root/docs"
overview="$docs/0000-overview.md"
errors=0

[ -d "$docs" ] || {
  echo "RepoRoute link check passed."
  exit 0
}

for file in "$docs"/*.md; do
  [ -e "$file" ] || continue
  dir=$(dirname "$file")
  awk '{
    rest = $0
    while (match(rest, /\[[^]]+\]\([^)]+\)/)) {
      link = substr(rest, RSTART, RLENGTH)
      sub(/^[^(]*\(/, "", link)
      sub(/\)$/, "", link)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", link)
      if (link !~ /^([A-Za-z][A-Za-z0-9+.-]*:|\/\/|#)/) {
        sub(/[?#].*$/, "", link)
        if (link ~ /\.md$/) print link
      }
      rest = substr(rest, RSTART + RLENGTH)
    }
  }' "$file" | while IFS= read -r target; do
    if [ ! -f "$dir/$target" ]; then
      echo "Broken link in $(basename "$file"): $target" >&2
      exit 2
    fi
  done || errors=1
done

for file in "$docs"/*.md; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  prefix=${name%%-*}
  case "$prefix" in
    [0-9][0-9][0-9][0-9])
      aa=$(printf '%s' "$prefix" | cut -c1-2)
      bb=$(printf '%s' "$prefix" | cut -c3-4)
      third=$(printf '%s' "$prefix" | cut -c3)
      fourth=$(printf '%s' "$prefix" | cut -c4)
      if [ "$prefix" = "0000" ] || [ "$prefix" = "9999" ]; then
        continue
      fi

      safe_name=$(printf '%s' "$name" | sed 's/[.[\*^$()+?{}|\\]/\\&/g')
      if [ "$bb" = "00" ]; then
        if [ ! -f "$overview" ] || ! grep -Eq "\[[^]]+\]\((\./)?$safe_name(#[^)]*)?\)" "$overview"; then
          echo "Chapter router not linked from 0000-overview.md: $name" >&2
          errors=1
        fi
      else
        chapter_prefix="${aa}00-"
        parent_prefix="$chapter_prefix"
        route_kind="Concrete document"

        if [ "$fourth" = "0" ]; then
          route_kind="Subrouter"
        elif [ "$third" != "0" ]; then
          subrouter_prefix="${aa}${third}0-"
          for subrouter in "$docs"/"$subrouter_prefix"*.md; do
            [ -e "$subrouter" ] || continue
            parent_prefix="$subrouter_prefix"
            break
          done
        fi

        found_parent=0
        linked=0
        for router in "$docs"/"$parent_prefix"*.md; do
          [ -e "$router" ] || continue
          found_parent=1
          if grep -Eq "\[[^]]+\]\((\./)?$safe_name(#[^)]*)?\)" "$router"; then
            linked=1
          fi
        done
        if [ "$found_parent" -eq 0 ]; then
          echo "Missing parent router $parent_prefix*.md for $name" >&2
          errors=1
        elif [ "$linked" -eq 0 ]; then
          echo "$route_kind not linked from parent $parent_prefix*.md: $name" >&2
          errors=1
        fi
      fi
      ;;
  esac
done

[ "$errors" -eq 0 ] || exit 1
echo "RepoRoute link check passed."
