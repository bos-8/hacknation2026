# Local Activity Journal

Load only when logging is enabled. Run the installed skill's
`scripts/remote_journal.py` with Python 3.11+; it has no third-party dependencies.
Equivalent `.ps1` and `.sh` launchers forward the same action/arguments and JSON
stdin to that backend; keep their adjacent `_runtime*` helpers when copying it.
It writes local agent-reported receipts, not an authenticated remote audit trail.

Pass one action (start/record/finish) on argv and JSON on stdin. Resolve the
installed skill path instead of assuming a Codex/Claude home directory. Examples
below are journal payloads, not remote commands to execute.

## Start After Consent

```json
{"consent":true,"workspace":"C:/project","target":"staging-api"}
```

`start` creates `logs/remote_YYYYMMDD-HHMMSS-ffffff.log` exclusively and returns its
absolute path. An optional directory must stay in the declared workspace. Consent
must come from the user; passing true is not a substitute for asking.

## Record Around Each Command

Before an authorized remote command, call `record`:

```json
{"workspace":"C:/project","log":"C:/project/logs/remote_20260101-120000-000001.log","phase":"planned","summary":"Verify the remote host","command":["ssh","<target-alias>","hostname"]}
```

After observing the result, call `record` again with phase completed and observed
exit_code=0, or failed and a nonzero exit code. Use skipped/unavailable without an
invented exit code when no command ran or its outcome cannot be established.
Include only short sanitized summaries; raw stdout/stderr and unknown payload
fields are rejected. Omit credential arguments and private identifiers before
calling the helper. Known-pattern rejection does not guarantee complete redaction.

## Finish

Use `finish` with workspace, log, a safe summary and status success/failed/partial/
cancelled based on actual verification. Finished logs cannot receive more events;
start a new approved session journal if needed. Writes are locked, ordered and
bounded; redirected/hardlinked files are rejected. POSIX logs are created with
owner-only permissions; Windows inherits the workspace ACL.

The helper returns nonzero on failure without running or retrying a remote task.
When logging was enabled, restore it or obtain the user's agreement to continue
without it before further mutations. Do not store these logs in .ai or commit/
upload them automatically.
