"""Credential-safe command identities shared with the portable helper bundle."""

import hashlib
import json
from pathlib import Path
import re

TOKEN = re.compile(r'\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b')
LABEL = r'(?:api[_-]?key|(?:access|refresh|id)[_-]?token|password|passwd|pwd|client[_-]?secret|secret|token|authorization|credential)'
ASSIGNMENT = re.compile(r'''(?ix)\b''' + LABEL + r'''["']?\s*[:=]\s*(?:["']([^\r\n"']+)["']|([^\s,;}]+))''')
URI_AUTH = re.compile(r'(?i)\b[a-z][a-z0-9+.-]*://[^\s/@]+(?::[^\s/@]*)?@')
BEARER = re.compile(r'(?i)\bBearer\s+[A-Za-z0-9._~+/-]+')
FLAG = re.compile(r'(?i)^--?(?:[a-z0-9]+[-_])?' + LABEL + r'(?:=|$)')
PRIVATE = re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)', re.S)


def redact(text):
    """Remove recognized credentials and terminal escape sequences from diagnostics."""
    text = PRIVATE.sub('[REDACTED PRIVATE KEY]', text)
    text = TOKEN.sub('[REDACTED]', text)
    text = URI_AUTH.sub('[REDACTED URI AUTH]@', text)
    text = ASSIGNMENT.sub('[REDACTED ASSIGNMENT]', text)
    text = BEARER.sub('[REDACTED AUTHORIZATION]', text)
    return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text).replace('\x1b', '')


def command_is_sensitive(argv):
    """Reject recognized credentials; callers must still avoid retaining raw argv."""
    text = ' '.join(argv)
    return bool(TOKEN.search(text) or URI_AUTH.search(text) or ASSIGNMENT.search(text)
                or BEARER.search(text) or PRIVATE.search(text) or any(FLAG.search(arg) for arg in argv))


def command_identity(argv):
    """Keep check identity without disclosing command arguments or executable paths."""
    return {'executable': redact(Path(argv[0].replace('\\', '/')).name),
            'command_sha256': hashlib.sha256(json.dumps(argv, ensure_ascii=True).encode()).hexdigest()}
