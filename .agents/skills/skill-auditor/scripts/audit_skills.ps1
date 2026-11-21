# Generated adapter; canonical backend: py. Do not edit by hand.
& (Join-Path $PSScriptRoot './_runtime.ps1') 'py' (Join-Path $PSScriptRoot 'audit_skills.py') @args
exit $LASTEXITCODE
