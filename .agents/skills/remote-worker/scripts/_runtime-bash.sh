#!/usr/bin/env bash
# Cross the Windows/MSYS argv boundary using data, without eval or shell quoting.
set -eu
count=${SKILLPACK_LAUNCH_ARGC:-}
[[ "$count" =~ ^[0-9]+$ ]] && [ "$count" -le 4096 ] || exit 2
arguments=()
for ((index=0; index<count; index++)); do
    key=SKILLPACK_LAUNCH_ARG_$index
    arguments+=("${!key}")
    unset "$key"
done
unset SKILLPACK_LAUNCH_ARGC
exec bash "${arguments[@]}"
