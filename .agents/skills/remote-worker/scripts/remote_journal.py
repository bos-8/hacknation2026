#!/usr/bin/env python3
"""Write opt-in local remote-task receipts; never execute remote operations."""

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

from command_safety import command_is_sensitive, redact

SCHEMA = 'skillpack-remote-journal-v1'
LOG_NAME = re.compile(r'remote_\d{8}-\d{6}-\d{6}\.log\Z')
MAX_LOG_BYTES = 4 * 1024 * 1024


def _safe_path(payload, value):
    """Keep journal paths in the declared local workspace and reject redirection."""
    workspace = Path(payload.get('workspace', os.getcwd())).resolve(strict=True)
    if not workspace.is_dir() or not isinstance(value, str) or not value:
        raise ValueError('A local workspace and path are required.')
    requested = Path(value)
    path = Path(os.path.abspath(requested if requested.is_absolute() else workspace / requested))
    try:
        parts = path.relative_to(workspace).parts
    except ValueError:
        raise ValueError('Journal path must stay inside the local workspace.') from None
    current = workspace
    for part in parts:
        current = current / part
        if os.path.lexists(current):
            attributes = current.lstat()
            if current.is_symlink() or getattr(attributes, 'st_file_attributes', 0) & 0x400:
                raise ValueError('Redirected journal path is not allowed.')
    return path


def _safe_text(value, limit=1000):
    """Reject recognized credentials and bound manually curated journal text."""
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError('Provide a short sanitized text value.')
    if command_is_sensitive([value]):
        raise ValueError('Credential-like journal content is not accepted.')
    cleaned = redact(value.strip())
    if not cleaned.strip():
        raise ValueError('Sanitized text must remain nonempty.')
    return cleaned


def _entry(event, sequence, **fields):
    return {'schema': SCHEMA, 'sequence': sequence,
            'time': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'event': event, 'evidence': 'agent-reported', **fields}


@contextmanager
def _locked_file(path):
    """Lock one unlinked regular log and release it even after interruption."""
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise ValueError('Journal must be a regular file without hard links.')
    descriptor = os.open(path, os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(descriptor, 'r+b') as handle:
        after = os.fstat(handle.fileno())
        if (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino) or after.st_nlink != 1:
            raise ValueError('Journal changed while opening.')
        deadline = time.monotonic() + 1
        while True:
            try:
                handle.seek(0)
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise ValueError('Journal is busy; no event was recorded.') from None
                time.sleep(0.025)
        try:
            yield handle
        finally:
            handle.seek(0)
            if os.name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _append(path, event, **fields):
    with _locked_file(path) as handle:
        content = handle.read(MAX_LOG_BYTES + 1)
        if len(content) > MAX_LOG_BYTES or not content.endswith(b'\n'):
            raise ValueError('Journal is oversized or incomplete.')
        try:
            lines = content.splitlines()
            first, last = json.loads(lines[0]), json.loads(lines[-1])
            if first.get('schema') != SCHEMA or first.get('event') != 'started' or last.get('schema') != SCHEMA:
                raise ValueError('Invalid journal identity.')
            if last.get('event') == 'finished':
                raise ValueError('Journal is already finished.')
            if type(last.get('sequence')) is not int or last['sequence'] != len(lines):
                raise ValueError('Invalid journal sequence.')
        except (IndexError, AttributeError, json.JSONDecodeError):
            raise ValueError('Invalid journal contents.') from None
        entry = _entry(event, last['sequence'] + 1, **fields)
        encoded = (json.dumps(entry, ensure_ascii=True) + '\n').encode('utf-8')
        if len(content) + len(encoded) > MAX_LOG_BYTES:
            raise ValueError('Journal size budget exhausted.')
        handle.seek(0, os.SEEK_END)
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    return {'log': str(path), 'event': event, 'sequence': entry['sequence']}


def run(action, payload):
    """Create or append explicit sanitized receipts after logging consent."""
    if not isinstance(payload, dict):
        raise ValueError('Journal input must be an object.')
    common = {'workspace'}
    fields = {'start': {'consent', 'directory', 'target'},
              'record': {'log', 'phase', 'summary', 'command', 'exit_code'},
              'finish': {'log', 'summary', 'status'}}
    if set(payload) - common - fields[action]:
        raise ValueError('Unsupported journal fields; raw output is not accepted.')
    if action == 'start':
        if payload.get('consent') is not True:
            raise ValueError('Explicit logging consent is required.')
        target = _safe_text(payload.get('target'), 64)
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', target):
            raise ValueError('Use a simple non-sensitive target alias.')
        directory = _safe_path(payload, payload.get('directory', 'logs'))
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        filename = 'remote_' + datetime.now().astimezone().strftime('%Y%m%d-%H%M%S-%f') + '.log'
        path = directory / filename
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(json.dumps(_entry('started', 1, target=target)) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        return {'log': str(path), 'event': 'started', 'sequence': 1}
    path = _safe_path(payload, payload.get('log'))
    if not LOG_NAME.fullmatch(path.name):
        raise ValueError('Use a journal created by this helper.')
    summary = _safe_text(payload.get('summary'))
    if action == 'finish':
        status = payload.get('status')
        if status not in ('success', 'failed', 'partial', 'cancelled'):
            raise ValueError('Finish status must describe the actual outcome.')
        return _append(path, 'finished', summary=summary, status=status)
    phase = payload.get('phase')
    if phase not in ('planned', 'completed', 'failed', 'skipped', 'unavailable'):
        raise ValueError('Unsupported journal phase.')
    command = payload.get('command', [])
    if not isinstance(command, list) or len(command) > 32 or any(not isinstance(value, str) or not value or len(value) > 512 for value in command):
        raise ValueError('Provide a bounded sanitized command argument list.')
    if phase == 'planned' and not command:
        raise ValueError('A planned operation needs its sanitized command.')
    if command_is_sensitive(command):
        raise ValueError('Credential-bearing command arguments are not accepted.')
    code = payload.get('exit_code')
    if phase == 'completed' and (type(code) is not int or code != 0):
        raise ValueError('Completed commands need observed exit code zero.')
    if phase == 'failed' and (type(code) is not int or code == 0):
        raise ValueError('Failed commands need an observed nonzero exit code.')
    if phase not in ('completed', 'failed') and code is not None:
        raise ValueError('Do not invent exit codes for unexecuted operations.')
    return _append(path, phase, summary=summary, command=[redact(value) for value in command], exit_code=code)


def main():
    """Read bounded JSON on stdin; never place command details in CLI arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('start', 'record', 'finish'))
    options = parser.parse_args()
    try:
        content = sys.stdin.read(65537)
        if len(content) > 65536:
            raise ValueError('Journal input is oversized.')
        print(json.dumps(run(options.action, json.loads(content))))
    except OSError as error:
        print(json.dumps({'status': 'FAILED', 'error': 'Journal I/O failed: ' + type(error).__name__}), file=sys.stderr)
        return 1
    except TypeError:
        print(json.dumps({'status': 'FAILED', 'error': 'Journal input has invalid field types.'}), file=sys.stderr)
        return 1
    except ValueError as error:
        print(json.dumps({'status': 'FAILED', 'error': str(error)}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
