<#
.SYNOPSIS
Validate RepoRoute and print session-level Scribe watch guidance.
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

$preflight = Join-Path $PSScriptRoot 'reporoute-preflight.ps1'
& $preflight -Root $Root

Write-Host 'Scribe watch active: documentation-aware guidance is on for this chat.'
Write-Host 'Start at docs/0000-overview.md, route through XX00 and optional XXX0, then load only the needed concrete leaf.'
Write-Host 'Watch is guidance only; it does not edit files or start subagents.'
