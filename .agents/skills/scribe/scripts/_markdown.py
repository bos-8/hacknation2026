"""Parse fenced-block boundaries and run optional strict validators without raw diagnostics."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess


def fenced_blocks(text: str):
    """Recognize backtick/tilde fences and their lengths; ignore markup inside blocks."""
    blocks, visible, errors = [], [], []
    current = None
    for number, line in enumerate(text.splitlines(), 1):
        if current:
            marker, length, language, start, content = current
            if re.fullmatch(r' {0,3}' + re.escape(marker) + '{' + str(length) + r',}[ \t]*', line):
                blocks.append({'language': language, 'line': start, 'text': '\n'.join(content)})
                current = None
            else:
                content.append(line)
            visible.append('')
            continue
        match = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line)
        if match:
            marker, info = match.groups()
            if marker[0] == '`' and '`' in info:
                visible.append(line)
                continue
            current = (marker[0], len(marker), info.strip().split()[0].lower() if info.strip() else '', number, [])
            visible.append('')
        else:
            visible.append(line)
    if current:
        errors.append(('UNCLOSED_CODE_FENCE', current[3]))
    return blocks, '\n'.join(visible), errors


def strict_validation(mode: str, documents: dict[str, str], tool_root) -> dict:
    """Require explicitly installed development tools; never install or log document bodies."""
    node = shutil.which('node')
    location = tool_root or os.environ.get('SKILLPACK_DOC_TOOLS')
    if not node or not location or not Path(location).is_dir():
        return {'status': 'UNAVAILABLE', 'issues': [{'rule': 'VALIDATOR_UNAVAILABLE'}]}
    request = {'mode': mode, 'documents': [{'name': name, 'text': text} for name, text in documents.items()]}
    if mode == 'mermaid':
        request['diagrams'] = [{'path': name, **block} for name, text in documents.items() for block in fenced_blocks(text)[0] if block['language'] == 'mermaid']
    try:
        result = subprocess.run([node, str(Path(__file__).with_name('_strict_docs.mjs')), str(Path(location).resolve())],
                                input=json.dumps(request), text=True, encoding='utf-8', capture_output=True, timeout=60)
        value = json.loads(result.stdout)
        if result.returncode or value.get('status') not in ('PASS', 'FAILED', 'UNAVAILABLE'):
            raise ValueError('Invalid validator result.')
        return value
    except (OSError, ValueError, subprocess.SubprocessError):
        return {'status': 'UNAVAILABLE', 'issues': [{'rule': 'VALIDATOR_UNAVAILABLE'}]}
