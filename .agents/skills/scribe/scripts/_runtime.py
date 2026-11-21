"""Launch a canonical script without changing its arguments, cwd or exit status."""

import os
from pathlib import Path
import shutil
import subprocess
import sys


def launch(backend: str, target: Path, arguments: list[str]) -> int:
    """Run a fixed entrypoint; missing optional runtimes fail before dispatch."""
    if not target.is_file():
        print('Canonical script is unavailable.', file=sys.stderr)
        return 2
    if backend == 'py':
        command = [sys.executable]
    elif backend == 'ps1':
        executable = shutil.which('pwsh')
        if not executable:
            print('PowerShell 7+ (pwsh) is required for this command.', file=sys.stderr)
            return 3
        command = [executable, '-NoLogo', '-NoProfile', '-File']
    elif backend == 'sh':
        executable = None
        if os.name == 'nt':
            candidate = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe'
            executable = str(candidate) if candidate.is_file() else None
        if not executable:
            executable = shutil.which('bash')
            if os.name == 'nt' and executable and Path(executable).parent == Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32':
                executable = None
        if not executable:
            print('Bash is required for this command.', file=sys.stderr)
            return 3
        command = [executable]
    else:
        print('Unknown canonical runtime.', file=sys.stderr)
        return 2
    try:
        if backend == 'sh' and os.name == 'nt':
            bootstrap = Path(__file__).with_name('_runtime-bash.sh')
            if not bootstrap.is_file():
                print('Bash argv bootstrap is unavailable.', file=sys.stderr)
                return 3
            values = [target.as_posix(), *arguments]
            environment = {**os.environ, 'SKILLPACK_LAUNCH_ARGC': str(len(values))}
            environment.update({f'SKILLPACK_LAUNCH_ARG_{index}': value for index, value in enumerate(values)})
            return subprocess.call([*command, bootstrap.as_posix()], env=environment)
        return subprocess.call([*command, target.as_posix(), *arguments])
    except OSError:
        print('Unable to launch the required runtime.', file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        return 130


def main() -> int:
    """Accept backend, canonical file, then uninterpreted script arguments."""
    if len(sys.argv) < 3:
        print('Usage: _runtime.py py|ps1|sh SCRIPT [arguments...]', file=sys.stderr)
        return 2
    return launch(sys.argv[1], Path(sys.argv[2]), sys.argv[3:])


if __name__ == '__main__':
    raise SystemExit(main())
