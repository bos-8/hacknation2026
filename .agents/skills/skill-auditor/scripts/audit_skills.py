#!/usr/bin/env python3
"""Audit installed skills with Python stdlib; source-only release checks are separate."""

import argparse
import json
from pathlib import Path
import re


def audit(root):
    """Check bounded local skill structure and links, without needing a source checkout."""
    findings = []
    skills = sorted(root.glob('*/SKILL.md'))
    names = set()
    for entry in skills:
        folder = entry.parent
        def fail(message):
            findings.append({'skill': folder.name, 'message': message})
        if entry.is_symlink() or entry.stat().st_size > 65536:
            fail('Linked or oversized SKILL.md.')
            continue
        text = entry.read_text(encoding='utf-8-sig')
        front = re.match(r'\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)', text, re.S)
        if not front:
            fail('Missing YAML frontmatter.')
            continue
        values = {}
        for key in ('name', 'description'):
            match = re.search(r'^' + key + r':\s*(.+)$', front[1], re.M)
            values[key] = match[1].strip().strip('"\'') if match else ''
        if values['name'] != folder.name or values['name'] in names:
            fail('Skill name must match its unique folder name.')
        names.add(values['name'])
        if not values['description'].startswith(('Use for ', 'Use when ')):
            fail('Description must state when to use the skill.')
        if not re.search(r'^# .+', text, re.M):
            fail('Missing H1 title.')
        metadata = folder / 'agents/openai.yaml'
        if not metadata.is_file():
            fail('Missing Skillpack UI metadata agents/openai.yaml.')
        documents = [entry, *folder.glob('branches/*.md'), *folder.glob('references/*.md')]
        if len(documents) > 200:
            fail('Instruction document budget exceeded.')
            continue
        graph = {}
        for document in documents:
            if document.is_symlink() or document.stat().st_size > 256 * 1024:
                fail('Linked or oversized instruction document.')
                continue
            body = document.read_text(encoding='utf-8-sig')
            targets = set(re.findall(r'\]\(([^\s)#]+)(?:#[^\s)]*)?\)', body))
            targets.update(re.findall(r'`((?:branches|references|scripts|tests)/[^`\s]+)`', body))
            graph[document.resolve()] = set()
            for target in targets:
                if re.match(r'[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
                    continue
                if target.startswith(('scripts/modules/', 'tests/pressure-prompts/')):
                    continue  # Explicit source-only policies are outside installed audit scope.
                if '*' in target:
                    if not any(path.is_file() and folder.resolve() in path.resolve().parents for path in folder.glob(target)):
                        fail('Unresolved resource pattern: ' + target)
                    continue
                local = (document.parent / target).resolve()
                # Router tables use paths relative to the skill root.
                if not local.exists():
                    local = (folder / target).resolve()
                if folder.resolve() not in local.parents or not local.is_file():
                    fail('Unresolved or outside skill resource: ' + target)
                else:
                    graph[document.resolve()].add(local)
        reached, pending = set(), [entry.resolve()]
        while pending:
            current = pending.pop()
            if current not in reached:
                reached.add(current)
                pending.extend(graph.get(current, ()))
        for document in documents[1:]:
            if document.resolve() not in reached:
                fail('Unreachable instruction: ' + document.relative_to(folder).as_posix())
    return {'status': 'FAILED' if findings or not skills else 'SUCCESS', 'skills': len(skills),
            'findings': findings, 'scope': 'INSTALLED_STRUCTURE_AND_LOCAL_RESOURCES',
            'not_checked': ['full YAML semantics', 'source config/manifest wiring', 'pressure/model execution']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skills-root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    try:
        result = audit(args.skills_root.resolve(strict=True))
    except (OSError, UnicodeError, ValueError):
        result = {'status': 'FAILED', 'findings': [{'message': 'Cannot read the selected skills root.'}]}
    print(json.dumps(result))
    return int(result['status'] != 'SUCCESS')


if __name__ == '__main__':
    raise SystemExit(main())
