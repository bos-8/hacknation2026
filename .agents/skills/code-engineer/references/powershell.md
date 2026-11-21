# PowerShell

Use PowerShell-native, Windows-safe automation.

## Invocation

Load through `$code-engineer powershell` or when PowerShell dominates the implementation task.

## Runtime

- Prefer `pwsh` / `pwsh.exe` over Windows PowerShell.
- Detect the repository's declared PowerShell version and available executable. Use that contract; do not impose Skillpack's own minimum on unrelated repositories.
- Use `-LiteralPath` for filesystem paths from users or variables.
- Avoid aliases in scripts.
- Do not mix PowerShell path enumeration with `cmd /c` for file mutation.

## Script Rules

- Use comment-based help for new or substantially edited `.ps1`, `.psm1`, and `.psd1`.
- Use `Set-StrictMode -Version Latest` and `$ErrorActionPreference = 'Stop'` in automation scripts when compatible.
- Use `[CmdletBinding()]` for non-trivial scripts.
- Use typed params and `ValidateSet` / `ValidateNotNullOrEmpty` when useful.
- Prefer structured objects over formatted strings when output may be consumed.
- Use `Write-Output` for pipeline data; use `throw` for failures.
- Verify resolved absolute paths before recursive delete or move.

## Validation

- `pwsh -NoLogo -NoProfile -File .\script.ps1`
- `pwsh -NoLogo -NoProfile -Command "<targeted command>"`
- PSScriptAnalyzer only if the repo already uses it or it is available.

## Related Skills

- Use `infra-builder` secrets-runtime leaf when scripts handle secrets.
