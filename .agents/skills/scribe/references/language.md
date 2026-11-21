# Language

English is the default documentation language unless the user or repository says
otherwise. Ordinary English documents use `.md`, without an `.en` suffix.

For other languages, put a lowercase two-letter language code immediately before
`.md`: Polish uses `.pl.md`, German `.de.md`, French `.fr.md`. This also applies
when the user requests a new non-English document without an English counterpart.

Translations preserve the original basename, numeric prefix and slug:

```text
0000-overview.md
0000-overview.pl.md
0100-architecture.md
0100-architecture.pl.md
0100-architecture.de.md
```

Do not translate the slug, allocate another route number, or use `_pl.md` or
`.md.pl`. For example, a Polish translation of `0000-overview.md` remains
`0000-overview.pl.md`, not a new `0001-*` route. Keep the source document and add
the requested translation and update relevant navigation links. Update any retained
legacy path metadata to the actual filename; do not add a `file` field by default.

The root router `0000-overview.md` should always exist in English. Other languages are optional paired files.

## Conventional Filename Exceptions

Keep conventional or tool-required entrypoints under their expected names and
locations: `README.md`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`,
`CHANGELOG.md` and `LICENSE.md`. Do not add a numeric prefix or force a language
suffix merely because their contents are Polish or another language. Respect
existing extensionless filenames such as `LICENSE` as well.

For an explicitly requested separate human-readable translation, `README.pl.md`
or an equivalent companion is appropriate; retain the canonical entrypoint and
link the companion. A translated `AGENTS.pl.md` is not a replacement for the
tool-consumed `AGENTS.md`. Translate license text only when requested and do not
silently replace its authoritative version. Preserve a repository's explicit
locale convention, such as a translation directory, instead of renaming it as
part of an unrelated edit.
