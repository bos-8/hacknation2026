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
$errors = @()

if (Test-Path -LiteralPath $docs) {
    Get-ChildItem -LiteralPath $docs -Filter "*.md" -File | ForEach-Object {
        $text = Get-Content -LiteralPath $_.FullName -Raw
        $fenceCount = ([regex]::Matches($text, '```')).Count
        if (($fenceCount % 2) -ne 0) {
            $errors += "Unclosed code fence: $($_.Name)"
        }
        if ($text -match '(?m)^#+\s*$') {
            $errors += "Empty heading: $($_.Name)"
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "RepoRoute Markdown check passed."
