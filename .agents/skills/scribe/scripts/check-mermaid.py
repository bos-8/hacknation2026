"""Detect Mermaid blocks without claiming strict diagram syntax validation."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _reporoute import main
raise SystemExit(main('check-mermaid'))
