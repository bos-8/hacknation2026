# Python

Write typed, stdlib-first, readable Python that matches the repo runtime.

## Invocation

Load through `$code-engineer python` or when Python dominates the implementation task.

## Workflow

1. Confirm Python version expectations from `pyproject.toml`, docs, CI, Docker, or runtime files.
2. Use modern Python features only when the repo supports them.
3. Prefer typing, `pathlib`, context managers, dataclasses, small cohesive functions, and explicit errors.
4. Prefer the standard library unless a dependency is already established or clearly justified.
5. Use async only when existing architecture and real concurrency needs support it.
6. Add docstrings for public functions, classes, and modules when they improve hover help or maintainability.
7. Follow repo tooling: `uv`, `poetry`, `hatch`, `pip-tools`, `pytest`, `ruff`, `mypy`, or `pyright`.
8. Validate with narrow lint, type, compile, or test checks.
