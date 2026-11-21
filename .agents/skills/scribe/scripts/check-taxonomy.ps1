param(
    [string]$Root = ".",
    [switch]$Strict,
    [switch]$StrictMetadata,
    [switch]$StrictMarkdown,
    [switch]$StrictMermaid,
    [string]$ToolRoot,
    [string[]]$File
)

if ($Strict -or $StrictMetadata -or $StrictMarkdown -or $StrictMermaid -or $ToolRoot -or $File) {
    . (Join-Path $PSScriptRoot '_strict-options.ps1')
    Invoke-ScribeStrict -ScriptName $MyInvocation.MyCommand.Name -Options $PSBoundParameters
    exit $LASTEXITCODE
}


$docs = Join-Path $Root "docs"
$overview = Join-Path $docs "0000-overview.md"
$errors = @()

if (-not (Test-Path -LiteralPath $overview)) {
    $errors += "Missing docs/0000-overview.md"
}

if (Test-Path -LiteralPath $docs) {
    Get-ChildItem -LiteralPath $docs -Filter "*.md" -File | ForEach-Object {
        if ($_.Name -cnotmatch '^(?:\d{4}-[a-z0-9][a-z0-9-]*|README|AGENTS|CLAUDE|CONTRIBUTING|SECURITY|CHANGELOG|LICENSE)(\.[a-z]{2})?\.md$') {
            $errors += "Invalid docs filename: $($_.Name)"
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "RepoRoute taxonomy check passed."
