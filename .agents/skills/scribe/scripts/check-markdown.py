"""Check basic Markdown fence and heading consistency."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _reporoute import main
raise SystemExit(main('check-markdown'))
