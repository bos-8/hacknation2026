<#
.SYNOPSIS
Run the read-only RepoRoute validation set for a repository.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$Root = '.',
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


Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$pwsh = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $pwsh -PathType Leaf)) {
    $pwsh = Join-Path $PSHOME 'pwsh'
}

$checks = @(
    'check-taxonomy.ps1',
    'check-links.ps1',
    'check-markdown.ps1',
    'check-mermaid.ps1'
)

foreach ($check in $checks) {
    $checkPath = Join-Path $PSScriptRoot $check
    & $pwsh -NoLogo -NoProfile -File $checkPath -Root $resolvedRoot
    if ($LASTEXITCODE -ne 0) {
        throw "RepoRoute preflight failed in $check."
    }
}

Write-Host 'RepoRoute preflight passed. Route through 0000 -> XX00 -> [XXX0 ->] XXXx.'
