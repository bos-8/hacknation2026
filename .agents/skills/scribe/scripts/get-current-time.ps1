<#
.SYNOPSIS
Return the current local date, date-time, or time in a documentation-safe format.

.PARAMETER Format
Select Date (yyyy-MM-dd), DateTime (ISO 8601 with local UTC offset), or Time
(HH:mm:ss). Defaults to DateTime.

.EXAMPLE
pwsh -NoLogo -NoProfile -File .\skills\scribe\scripts\get-current-time.ps1 -Format DateTime
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('Date', 'DateTime', 'Time')]
    [string]$Format = 'DateTime'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$now = Get-Date
$value = switch ($Format) {
    'Date' { $now.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) }
    'DateTime' { $now.ToString('yyyy-MM-ddTHH:mm:sszzz', [Globalization.CultureInfo]::InvariantCulture) }
    'Time' { $now.ToString('HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture) }
}

Write-Output $value
