#!/usr/bin/env sh
set -eu

skill_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
fixture_root=$(mktemp -d "${TMPDIR:-/tmp}/skillpack-scribe.XXXXXX")
trap 'rm -rf "$fixture_root"' EXIT HUP INT TERM

make_case() {
  mkdir -p "$fixture_root/$1/docs"
}

expect_pass() {
  if ! sh "$1" "$2" >/dev/null 2>&1; then
    echo "Expected pass: $1 ($2)" >&2
    exit 1
  fi
}

expect_fail() {
  if sh "$1" "$2" >/dev/null 2>&1; then
    echo "Expected failure: $1 ($2)" >&2
    exit 1
  fi
}

taxonomy="$skill_root/scripts/check-taxonomy.sh"
links="$skill_root/scripts/check-links.sh"

make_case valid-tree
printf '# Overview\n\n- [Architecture](./0300-architecture.md)\n' > "$fixture_root/valid-tree/docs/0000-overview.md"
printf '# Architecture\n\n- [High Level](./0301-high-level.md)\n- [Runtime](./0310-runtime.md)\n' > "$fixture_root/valid-tree/docs/0300-architecture.md"
printf '# High Level\n' > "$fixture_root/valid-tree/docs/0301-high-level.md"
printf '# Runtime\n\n- [Runtime Map](./0311-runtime-map.md)\n' > "$fixture_root/valid-tree/docs/0310-runtime.md"
printf '# Runtime Map\n' > "$fixture_root/valid-tree/docs/0311-runtime-map.md"
expect_pass "$taxonomy" "$fixture_root/valid-tree"
expect_pass "$links" "$fixture_root/valid-tree"

make_case invalid-filename
printf '# Overview\n' > "$fixture_root/invalid-filename/docs/0000-overview.md"
printf '# Architecture\n' > "$fixture_root/invalid-filename/docs/architecture.md"
expect_fail "$taxonomy" "$fixture_root/invalid-filename"

make_case router-not-linked-from-root
printf '# Overview\n' > "$fixture_root/router-not-linked-from-root/docs/0000-overview.md"
printf '# Architecture\n' > "$fixture_root/router-not-linked-from-root/docs/0300-architecture.md"
expect_fail "$links" "$fixture_root/router-not-linked-from-root"

make_case subrouter-not-linked-from-chapter
printf '# Overview\n\n- [Architecture](./0300-architecture.md)\n' > "$fixture_root/subrouter-not-linked-from-chapter/docs/0000-overview.md"
printf '# Architecture\n' > "$fixture_root/subrouter-not-linked-from-chapter/docs/0300-architecture.md"
printf '# Runtime\n' > "$fixture_root/subrouter-not-linked-from-chapter/docs/0310-runtime.md"
expect_fail "$links" "$fixture_root/subrouter-not-linked-from-chapter"

make_case leaf-bypasses-existing-subrouter
printf '# Overview\n\n- [Architecture](./0300-architecture.md)\n' > "$fixture_root/leaf-bypasses-existing-subrouter/docs/0000-overview.md"
printf '# Architecture\n\n- [Runtime](./0310-runtime.md)\n- [Runtime Map](./0311-runtime-map.md)\n' > "$fixture_root/leaf-bypasses-existing-subrouter/docs/0300-architecture.md"
printf '# Runtime\n' > "$fixture_root/leaf-bypasses-existing-subrouter/docs/0310-runtime.md"
printf '# Runtime Map\n' > "$fixture_root/leaf-bypasses-existing-subrouter/docs/0311-runtime-map.md"
expect_fail "$links" "$fixture_root/leaf-bypasses-existing-subrouter"

make_case leaf-not-linked-from-router
printf '# Overview\n\n- [Architecture](./0300-architecture.md)\n' > "$fixture_root/leaf-not-linked-from-router/docs/0000-overview.md"
printf '# Architecture\n' > "$fixture_root/leaf-not-linked-from-router/docs/0300-architecture.md"
printf '# High Level\n' > "$fixture_root/leaf-not-linked-from-router/docs/0301-high-level.md"
expect_fail "$links" "$fixture_root/leaf-not-linked-from-router"

make_case broken-local-link
printf '# Overview\n\n- [Missing](./0300-missing.md)\n' > "$fixture_root/broken-local-link/docs/0000-overview.md"
expect_fail "$links" "$fixture_root/broken-local-link"

make_case external-and-anchor-links
printf '# Overview\n[External](https://example.com/missing.md) [Section](#overview) [Self](./0000-overview.md#overview)\n' > "$fixture_root/external-and-anchor-links/docs/0000-overview.md"
expect_pass "$links" "$fixture_root/external-and-anchor-links"

make_case broken-link-with-fragment
printf '# Overview\n[Missing](./0300-missing.md#section)\n' > "$fixture_root/broken-link-with-fragment/docs/0000-overview.md"
expect_fail "$links" "$fixture_root/broken-link-with-fragment"

make_case first-of-multiple-links-broken
printf '# Overview\n[Missing](./0300-missing.md) [Self](./0000-overview.md)\n' > "$fixture_root/first-of-multiple-links-broken/docs/0000-overview.md"
expect_fail "$links" "$fixture_root/first-of-multiple-links-broken"

make_case translated-documents
printf '# Overview\n' > "$fixture_root/translated-documents/docs/0000-overview.md"
printf '# Przeglad\n' > "$fixture_root/translated-documents/docs/0000-overview.pl.md"
printf '# Ubersicht\n' > "$fixture_root/translated-documents/docs/0000-overview.de.md"
expect_pass "$taxonomy" "$fixture_root/translated-documents"
expect_pass "$links" "$fixture_root/translated-documents"

make_case conventional-entrypoints
printf '# Overview\n' > "$fixture_root/conventional-entrypoints/docs/0000-overview.md"
for name in README.md README.pl.md AGENTS.md CLAUDE.md CONTRIBUTING.md SECURITY.md CHANGELOG.md LICENSE.md; do
  printf '# Informacje\n' > "$fixture_root/conventional-entrypoints/docs/$name"
done
expect_pass "$taxonomy" "$fixture_root/conventional-entrypoints"
expect_pass "$links" "$fixture_root/conventional-entrypoints"

for name in 0300-architecture_pl.md 0300-architecture.PL.md 0300-architecture.md.pl.md; do
  make_case "$name"
  printf '# Overview\n' > "$fixture_root/$name/docs/0000-overview.md"
  printf '# Architecture\n' > "$fixture_root/$name/docs/$name"
  expect_fail "$taxonomy" "$fixture_root/$name"
done

echo 'RepoRoute fixture tests passed: 15 cases.'
