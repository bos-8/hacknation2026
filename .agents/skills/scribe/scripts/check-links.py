"""Check local Markdown links and the RepoRoute parent routing chain."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _reporoute import main
raise SystemExit(main('check-links'))
