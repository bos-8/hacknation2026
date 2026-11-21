# syntax=docker/dockerfile:1
ARG PYTHON_IMAGE=python:3.14.7-slim-bookworm
FROM ${PYTHON_IMAGE} AS dependencies
WORKDIR /build
COPY apps/pyworker/requirements.lock ./requirements.lock
# Preserve the complete hash pins, excluding the development-only Ruff block.
RUN python - <<'PY'
from pathlib import Path
result, skip = [], False
for line in Path('requirements.lock').read_text().splitlines():
    if line and not line.startswith((' ', '#')):
        skip = line.startswith('ruff==')
    if not skip:
        result.append(line)
Path('requirements.runtime.lock').write_text('\n'.join(result) + '\n')
PY
RUN python -m venv /opt/venv && /opt/venv/bin/python -m pip install \
    --no-cache-dir --require-hashes --only-binary=:all: -r requirements.runtime.lock \
    && /opt/venv/bin/python -m pip check

FROM ${PYTHON_IMAGE} AS runtime
WORKDIR /app
RUN groupadd --gid 10001 worker && useradd --uid 10001 --gid 10001 --no-create-home worker
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies /opt/venv /opt/venv
COPY apps/pyworker/src ./src
COPY apps/pyworker/resources ./resources
ENV PATH=/opt/venv/bin:$PATH PYTHONPATH=/app/src PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 PYWORKER_HOST=0.0.0.0 PYWORKER_ALLOW_NETWORK_BIND=true
USER worker
EXPOSE 8010
CMD ["python", "-m", "pyworker"]
