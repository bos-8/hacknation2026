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

function Test-DocumentLink {
    param(
        [Parameter(Mandatory)]
        [string]$SourcePath,

        [Parameter(Mandatory)]
        [string]$TargetName
    )

    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
        return $false
    }

    $sourceText = Get-Content -LiteralPath $SourcePath -Raw
    $escapedName = [regex]::Escape($TargetName)
    return $sourceText -match "\[[^\]]+\]\((\./)?$escapedName(#[^)]+)?\)"
}

if (Test-Path -LiteralPath $docs) {
    $docFiles = Get-ChildItem -LiteralPath $docs -Filter "*.md" -File

    $docFiles | ForEach-Object {
        $content = Get-Content -LiteralPath $_.FullName
        foreach ($line in $content) {
            foreach ($match in [regex]::Matches($line, '\[[^\]]+\]\((?<target>[^)]+)\)')) {
                $target = $match.Groups['target'].Value.Trim()
                if ($target -match '^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//|#)') {
                    continue
                }
                $target = ($target -split '[#?]', 2)[0]
                if ($target -notmatch '\.md$') {
                    continue
                }
                $targetPath = Join-Path $_.DirectoryName $target
                if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
                    $errors += "Broken link in $($_.Name): $target"
                }
            }
        }
    }

    $docFiles | ForEach-Object {
        if ($_.Name -notmatch '^(\d{2})(\d{2})-[a-z0-9][a-z0-9-]*(\.[a-z]{2})?\.md$') {
            return
        }

        $chapter = $matches[1]
        $entry = $matches[2]
        $route = "$chapter$entry"

        if ($route -eq '0000' -or $route -eq '9999') {
            return
        }

        if ($entry -eq '00') {
            if (-not (Test-DocumentLink -SourcePath $overview -TargetName $_.Name)) {
                $errors += "Chapter router not linked from 0000-overview.md: $($_.Name)"
            }
            return
        }

        $leafName = $_.Name
        $chapterPrefix = "$chapter" + "00-"
        $chapterRouters = $docFiles | Where-Object { $_.Name.StartsWith($chapterPrefix, [StringComparison]::OrdinalIgnoreCase) }
        if (-not $chapterRouters) {
            $errors += "Missing chapter router $chapterPrefix*.md for $leafName"
            return
        }

        $parentPrefix = $chapterPrefix
        $parentRouters = $chapterRouters
        $routeKind = if ($entry.EndsWith('0')) { 'Subrouter' } else { 'Concrete document' }

        if (-not $entry.EndsWith('0') -and $entry.Substring(0, 1) -ne '0') {
            $subrouterPrefix = "$chapter$($entry.Substring(0, 1))" + "0-"
            $subrouters = $docFiles | Where-Object { $_.Name.StartsWith($subrouterPrefix, [StringComparison]::OrdinalIgnoreCase) }
            if ($subrouters) {
                $parentPrefix = $subrouterPrefix
                $parentRouters = $subrouters
            }
        }

        $linked = $false
        foreach ($router in $parentRouters) {
            if (Test-DocumentLink -SourcePath $router.FullName -TargetName $leafName) {
                $linked = $true
                break
            }
        }

        if (-not $linked) {
            $errors += "$routeKind not linked from parent $parentPrefix*.md: $leafName"
        }
    }
}

if ($errors.Count -gt 0) {
    $errors | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "RepoRoute link check passed."
