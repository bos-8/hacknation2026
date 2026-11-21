"""Return local Date, DateTime or Time without external dependencies."""

import argparse
from datetime import datetime


def main():
    """Print one timestamp in the same format as the PowerShell helper."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", "-Format", choices=("Date", "DateTime", "Time"), default="DateTime")
    args = parser.parse_args()
    now = datetime.now().astimezone()
    value = {"Date": now.strftime("%Y-%m-%d"), "Time": now.strftime("%H:%M:%S"),
             "DateTime": now.isoformat(timespec="seconds")}[args.format]
    print(value)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
