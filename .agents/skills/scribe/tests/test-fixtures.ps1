<#
.SYNOPSIS
Verify RepoRoute taxonomy and link checks against positive and negative fixtures.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("skillpack-scribe-" + [guid]::NewGuid().ToString('N'))
$pwsh = Join-Path $PSHOME 'pwsh.exe'
if (-not (Test-Path -LiteralPath $pwsh -PathType Leaf)) {
    $pwsh = Join-Path $PSHOME 'pwsh'
}

$taxonomyChecker = Join-Path $PSScriptRoot '..\scripts\check-taxonomy.ps1'
$linkChecker = Join-Path $PSScriptRoot '..\scripts\check-links.ps1'

function Invoke-FixtureCheck {
    param(
        [Parameter(Mandatory)]
        [string]$ScriptPath,

        [Parameter(Mandatory)]
        [string]$CaseRoot
    )

    $output = & $pwsh -NoLogo -NoProfile -File $ScriptPath -Root $CaseRoot 2>&1
    [pscustomobject]@{
        Passed = $LASTEXITCODE -eq 0
        Output = @($output) -join [Environment]::NewLine
    }
}

function Add-FixtureFile {
    param(
        [Parameter(Mandatory)]
        [string]$CaseRoot,

        [Parameter(Mandatory)]
        [string]$Name,

        [Parameter(Mandatory)]
        [string]$Content
    )

    $docs = Join-Path $CaseRoot 'docs'
    New-Item -ItemType Directory -Path $docs -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $docs $Name) -Value $Content -Encoding utf8NoBOM
}

$cases = @(
    @{
        Name = 'valid-tree'
        Taxonomy = $true
        Links = $true
        Files = @{
            '0000-overview.md' = "# Overview`n`n- [Architecture](./0300-architecture.md)"
            '0300-architecture.md' = "# Architecture`n`n- [High Level](./0301-high-level.md)`n- [Runtime](./0310-runtime.md)"
            '0301-high-level.md' = '# High Level'
            '0310-runtime.md' = "# Runtime`n`n- [Runtime Map](./0311-runtime-map.md)"
            '0311-runtime-map.md' = '# Runtime Map'
        }
    },
    @{
        Name = 'invalid-filename'
        Taxonomy = $false
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview'
            'architecture.md' = '# Architecture'
        }
    },
    @{
        Name = 'router-not-linked-from-root'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = '# Overview'
            '0300-architecture.md' = '# Architecture'
        }
    },
    @{
        Name = 'subrouter-not-linked-from-chapter'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n`n- [Architecture](./0300-architecture.md)"
            '0300-architecture.md' = '# Architecture'
            '0310-runtime.md' = '# Runtime'
        }
    },
    @{
        Name = 'leaf-bypasses-existing-subrouter'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n`n- [Architecture](./0300-architecture.md)"
            '0300-architecture.md' = "# Architecture`n`n- [Runtime](./0310-runtime.md)`n- [Runtime Map](./0311-runtime-map.md)"
            '0310-runtime.md' = '# Runtime'
            '0311-runtime-map.md' = '# Runtime Map'
        }
    },
    @{
        Name = 'leaf-not-linked-from-router'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n`n- [Architecture](./0300-architecture.md)"
            '0300-architecture.md' = '# Architecture'
            '0301-high-level.md' = '# High Level'
        }
    },
    @{
        Name = 'external-and-anchor-links'
        Taxonomy = $true
        Links = $true
        Files = @{
            '0000-overview.md' = "# Overview`n[External](https://example.com/missing.md) [Section](#overview) [Self](./0000-overview.md#overview)"
        }
    },
    @{
        Name = 'broken-link-with-fragment'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n[Missing](./0300-missing.md#section)"
        }
    },
    @{
        Name = 'first-of-multiple-links-broken'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n[Missing](./0300-missing.md) [Self](./0000-overview.md)"
        }
    },
    @{
        Name = 'translated-documents'
        Taxonomy = $true
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview'
            '0000-overview.pl.md' = '# Przeglad'
            '0000-overview.de.md' = '# Ubersicht'
        }
    },
    @{
        Name = 'conventional-entrypoints'
        Taxonomy = $true
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview'
            'README.md' = '# Informacje'
            'README.pl.md' = '# Informacje po polsku'
            'AGENTS.md' = '# Instrukcje'
            'CLAUDE.md' = '# Instrukcje'
            'CONTRIBUTING.md' = '# Wspolpraca'
            'SECURITY.md' = '# Bezpieczenstwo'
            'CHANGELOG.md' = '# Zmiany'
            'LICENSE.md' = '# Licencja'
        }
    },
    @{
        Name = 'invalid-language-underscore'
        Taxonomy = $false
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview'
            '0300-architecture_pl.md' = '# Architecture'
        }
    },
    @{
        Name = 'invalid-language-case'
        Taxonomy = $false
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview [Architecture](./0300-architecture.PL.md)'
            '0300-architecture.PL.md' = '# Architecture'
        }
    },
    @{
        Name = 'invalid-language-position'
        Taxonomy = $false
        Links = $true
        Files = @{
            '0000-overview.md' = '# Overview'
            '0300-architecture.md.pl.md' = '# Architecture'
        }
    },
    @{
        Name = 'broken-local-link'
        Taxonomy = $true
        Links = $false
        Files = @{
            '0000-overview.md' = "# Overview`n`n- [Missing](./0300-missing.md)"
        }
    }
)

try {
    foreach ($case in $cases) {
        $caseRoot = Join-Path $fixtureRoot $case.Name
        foreach ($file in $case.Files.GetEnumerator()) {
            Add-FixtureFile -CaseRoot $caseRoot -Name $file.Key -Content $file.Value
        }

        $taxonomy = Invoke-FixtureCheck -ScriptPath $taxonomyChecker -CaseRoot $caseRoot
        $links = Invoke-FixtureCheck -ScriptPath $linkChecker -CaseRoot $caseRoot

        if ($taxonomy.Passed -ne $case.Taxonomy) {
            throw "Fixture '$($case.Name)' taxonomy result mismatch.`n$($taxonomy.Output)"
        }
        if ($links.Passed -ne $case.Links) {
            throw "Fixture '$($case.Name)' link result mismatch.`n$($links.Output)"
        }
    }
}
finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $resolvedFixture = [System.IO.Path]::GetFullPath($fixtureRoot)
    if ($resolvedFixture.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedFixture)) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}

Write-Host "RepoRoute fixture tests passed: $($cases.Count) cases."
