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
$found = $false

if (Test-Path -LiteralPath $docs) {
    Get-ChildItem -LiteralPath $docs -Filter "*.md" -File | ForEach-Object {
        if (Select-String -LiteralPath $_.FullName -Pattern '```mermaid' -Quiet) {
            $found = $true
        }
    }
}

if (-not $found) {
    Write-Host "No Mermaid blocks found; skipped."
    exit 0
}

Write-Host "Mermaid blocks found. Use -StrictMermaid with validation tools for syntax checks."
