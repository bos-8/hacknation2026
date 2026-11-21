#!/bin/sh
# Generated adapter; canonical backend: py. Do not edit by hand.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec sh "$script_dir/./_runtime.sh" 'py' "$script_dir/remote_journal.py" "$@"
