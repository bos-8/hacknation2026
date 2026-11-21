# Generated adapter; canonical backend: py. Do not edit by hand.
& (Join-Path $PSScriptRoot './_runtime.ps1') 'py' (Join-Path $PSScriptRoot 'remote_journal.py') @args
exit $LASTEXITCODE
