#!/bin/sh
# Return local Date, DateTime or Time using POSIX tools.
set -eu

format=DateTime
if [ "$#" -ne 0 ]; then
    if [ "$#" -ne 2 ] || { [ "$1" != "--format" ] && [ "$1" != "-Format" ]; }; then
        printf '%s\n' 'Usage: get-current-time.sh [--format Date|DateTime|Time]' >&2
        exit 2
    fi
    format=$2
fi

case "$format" in
    Date) date '+%Y-%m-%d' ;;
    Time) date '+%H:%M:%S' ;;
    DateTime) date '+%Y-%m-%dT%H:%M:%S%z' | sed 's/\([+-][0-9][0-9]\)\([0-9][0-9]\)$/\1:\2/' ;;
    *) printf '%s\n' 'Format must be Date, DateTime or Time.' >&2; exit 2 ;;
esac
