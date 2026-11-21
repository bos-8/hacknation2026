"""Validate docs and print session guidance without starting a background watcher."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _reporoute import main
raise SystemExit(main('reporoute-watch'))
