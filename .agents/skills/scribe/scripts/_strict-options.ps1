function Invoke-ScribeStrict {
    param([string]$ScriptName, [System.Collections.IDictionary]$Options)
    $forward = @('--root', $(if ($Options.Keys -contains 'Root') { $Options['Root'] } else { '.' }))
    foreach ($option in @{'Strict'='--strict'; 'StrictMetadata'='--strict-metadata'; 'StrictMarkdown'='--strict-markdown'; 'StrictMermaid'='--strict-mermaid'}.GetEnumerator()) {
        if ($Options[$option.Key]) { $forward += $option.Value }
    }
    if ($Options['ToolRoot']) { $forward += @('--tool-root', $Options['ToolRoot']) }
    foreach ($name in $Options['File']) { $forward += @('--file', $name) }
    $entry = [IO.Path]::ChangeExtension($ScriptName, '.py')
    & (Join-Path $PSScriptRoot '_runtime.ps1') 'py' (Join-Path $PSScriptRoot $entry) @forward
}
