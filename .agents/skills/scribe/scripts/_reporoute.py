"""Portable, read-only RepoRoute checks; Markdown/Mermaid checks are heuristic."""

import argparse
from pathlib import Path
import re
import stat
import sys

from _markdown import fenced_blocks, strict_validation

DOCUMENT_NAME = re.compile(r'(?:\d{4}-[a-z0-9][a-z0-9-]*|README|AGENTS|CLAUDE|CONTRIBUTING|SECURITY|CHANGELOG|LICENSE)(?:\.[a-z]{2})?\.md')
ROUTE_NAME = re.compile(r'(\d{2})(\d{2})-[a-z0-9][a-z0-9-]*(?:\.[a-z]{2})?\.md')
LINK = re.compile(r'\[[^\]]+\]\(([^)]+)\)')


def redirected(path: Path) -> bool:
    """Reject symbolic links and Windows junction/reparse points before reading."""
    attributes = path.lstat()
    return stat.S_ISLNK(attributes.st_mode) or bool(getattr(attributes, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0))


def documents(root: Path) -> dict[str, str]:
    """Read top-level docs with bounded regular-file access, without following links."""
    directory = root / 'docs'
    if directory.exists() and redirected(directory):
        raise ValueError('Linked docs directories are unsupported.')
    result = {}
    total = 0
    for path in sorted(directory.glob('*.md')):
        if redirected(path) or not path.is_file() or path.stat().st_size > 1024 * 1024:
            raise ValueError('Document must be an unlinked regular file below 1 MiB.')
        result[path.name] = path.read_text(encoding='utf-8-sig')
        total += path.stat().st_size
        if len(result) > 1000 or total > 16 * 1024 * 1024:
            raise ValueError('Documentation scan limit exceeded.')
    return result


def links_to(text: str, name: str) -> bool:
    """Recognize a direct sibling router link, allowing a fragment."""
    return any(re.fullmatch(r'(?:\./)?' + re.escape(name) + r'(?:#[^)]*)?', match.group(1)) for match in LINK.finditer(text))


def check(action: str, root: Path, docs: dict[str, str]) -> list[str]:
    """Return location-only findings for one check; never edit source documents."""
    errors = []
    if action == 'check-taxonomy':
        if '0000-overview.md' not in docs:
            errors.append('Missing docs/0000-overview.md')
        errors.extend('Invalid docs filename: ' + name for name in docs if not DOCUMENT_NAME.fullmatch(name))
    elif action == 'check-markdown':
        for name, text in docs.items():
            _, visible, fences = fenced_blocks(text)
            errors.extend(f'{kind}: {name}:{number}' for kind, number in fences)
            if re.search(r'^ {0,3}#{1,6}[ \t]*$', visible, re.M):
                errors.append('Empty heading: ' + name)
    elif action == 'check-links':
        for name, text in docs.items():
            for match in LINK.finditer(text):
                target = match.group(1).strip()
                if re.match(r'(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//|#)', target):
                    continue
                target = re.split(r'[?#]', target, maxsplit=1)[0]
                if target.endswith('.md') and not (root / 'docs' / target).is_file():
                    errors.append('Broken Markdown link in ' + name)
            route = ROUTE_NAME.fullmatch(name)
            if not route:
                continue
            chapter, entry = route.groups()
            if chapter + entry in ('0000', '9999'):
                continue
            if entry == '00':
                parents = ['0000-overview.md']
            else:
                parents = [item for item in docs if item.startswith(chapter + '00-')]
                if not parents:
                    errors.append('Missing chapter router for ' + name)
                    continue
                if not entry.endswith('0') and not entry.startswith('0'):
                    subrouters = [item for item in docs if item.startswith(chapter + entry[0] + '0-')]
                    if subrouters:
                        parents = subrouters
            if not any(links_to(docs.get(parent, ''), name) for parent in parents):
                errors.append('Document not linked from parent router: ' + name)
    elif action == 'check-mermaid':
        for name, text in docs.items():
            errors.extend(f'{kind}: {name}:{number}' for kind, number in fenced_blocks(text)[2])
    else:
        raise ValueError('Unknown RepoRoute check.')
    return errors


def main(action: str) -> int:
    """Accept positional root, --root or -Root; preserve existing read-only output."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?')
    parser.add_argument('--root', '-Root')
    parser.add_argument('--file', action='append', default=[], help='selected docs filenames for markup/strict checks')
    parser.add_argument('--strict', action='store_true', help='require metadata, Markdown and Mermaid validators')
    parser.add_argument('--strict-metadata', action='store_true')
    parser.add_argument('--strict-markdown', action='store_true')
    parser.add_argument('--strict-mermaid', action='store_true')
    parser.add_argument('--tool-root', help='directory containing optional validation-only Node dependencies')
    args = parser.parse_args()
    if args.directory and args.root:
        parser.error('Supply the root once.')
    root = Path(args.root or args.directory or '.').resolve()
    try:
        if not root.is_dir():
            raise ValueError('Root must be an existing directory.')
        docs = documents(root)
        if any(Path(name).name != name or name not in docs for name in args.file):
            raise ValueError('Select existing sibling document names.')
        selected_docs = {name: docs[name] for name in args.file} if args.file else docs
        checks = ('check-taxonomy', 'check-links', 'check-markdown', 'check-mermaid') if action in ('reporoute-preflight', 'reporoute-watch') else (action,)
        for selected in checks:
            active = docs if selected in ('check-taxonomy', 'check-links') else selected_docs
            errors = check(selected, root, active)
            if errors:
                for error in errors:
                    print(error, file=sys.stderr)
                return 1
            if selected == 'check-mermaid':
                print('Mermaid blocks found; use --strict-mermaid with validation tools for syntax checks.' if any('```mermaid' in text for text in docs.values()) else 'No Mermaid blocks found; skipped.')
            else:
                print('RepoRoute ' + selected.removeprefix('check-') + ' check passed.')
        for enabled, mode in ((args.strict or args.strict_metadata, 'metadata'), (args.strict or args.strict_markdown, 'markdown'), (args.strict or args.strict_mermaid, 'mermaid')):
            if not enabled:
                continue
            result = strict_validation(mode, selected_docs, args.tool_root)
            if result['status'] != 'PASS':
                for item in result['issues']:
                    print(f"{item['rule']}: {item.get('path', '.')}:{item.get('line', 0)}", file=sys.stderr)
                return 3 if result['status'] == 'UNAVAILABLE' else 1
            print('Strict ' + mode + ' validation passed.')
        if action in ('reporoute-preflight', 'reporoute-watch'):
            print('RepoRoute preflight passed. Route through 0000 -> XX00 -> [XXX0 ->] XXXx.')
        if action == 'reporoute-watch':
            print('Scribe watch active: documentation-aware guidance is on for this chat. No files edited or background process started.')
        return 0
    except (OSError, ValueError):
        print('Unable to inspect the selected documentation safely.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main('reporoute-preflight'))
