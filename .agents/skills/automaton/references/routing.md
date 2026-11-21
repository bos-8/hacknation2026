# Catalog Routing

The installed `hooks/skillpack/skill-index.json` catalog is generated from root descriptions and branch/leaf paths. Consult it when needed, then use the runtime-native `hook_runner.ps1`, `.py` or `.sh` command supplied by startup with handler `modes_core`, action `route`, and explicit JSON containing cwd, session_id, selected skills and optional resource paths to load actual instructions. Empty routes require a reason for a trivial/no-skill task. The receipt proves instruction delivery, not compliance; behavioral routing tests remain separate.

Use the generated catalog rather than maintaining another skill-to-task matrix. Fall back to available root descriptions when the catalog is unavailable; never invent skills or claim an unavailable route was delivered.
