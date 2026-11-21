<#
.SYNOPSIS
Forward a canonical script through Python 3.11+ without evaluating arguments.
#>
$runtimeArguments = @($args)
function Test-SkillpackPython {
    param([string]$Executable, [string[]]$Prefix)
    $process = [Diagnostics.Process]::new()
    try {
        $command = Get-Command -Name $Executable -CommandType Application -ErrorAction Stop | Select-Object -First 1
        $process.StartInfo.FileName = $command.Source
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        foreach ($value in $Prefix) { $process.StartInfo.ArgumentList.Add($value) }
        foreach ($value in @('-I', '-S', '-c', 'import sys; sys.exit(sys.version_info < (3, 11))')) {
            $process.StartInfo.ArgumentList.Add($value)
        }
        if (-not $process.Start()) { return $false }
        $null = $process.StandardOutput.ReadToEndAsync()
        $null = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(3000)) {
            $process.Kill($true)
            $process.WaitForExit()
            return $false
        }
        return $process.ExitCode -eq 0
    }
    catch { return $false }
    finally { $process.Dispose() }
}
foreach ($candidate in @($env:SKILLPACK_PYTHON, 'python3', 'python', 'py')) {
    if (-not $candidate) { continue }
    $prefix = if ($candidate -eq 'py') { @('-3') } else { @() }
    try {
        if (-not (Test-SkillpackPython -Executable $candidate -Prefix $prefix)) { continue }
        & $candidate @prefix (Join-Path $PSScriptRoot '_runtime.py') @runtimeArguments
        exit $LASTEXITCODE
    }
    catch [System.Management.Automation.CommandNotFoundException] { continue }
}
[Console]::Error.WriteLine('Python 3.11+ is required. Set SKILLPACK_PYTHON to its executable path.')
exit 3
