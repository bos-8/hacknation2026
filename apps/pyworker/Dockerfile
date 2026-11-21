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

FROM ${PYTHON_IMAGE} AS worker-base
WORKDIR /app
RUN groupadd --gid 10001 worker && useradd --uid 10001 --gid 10001 --no-create-home worker
COPY --from=dependencies /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH PYTHONPATH=/app/src PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 PYWORKER_HOST=0.0.0.0 PYWORKER_ALLOW_NETWORK_BIND=true
USER worker
EXPOSE 8010
CMD ["python", "-m", "pyworker"]

FROM worker-base AS runtime
COPY apps/pyworker/src ./src

FROM maven:3.9.11-eclipse-temurin-21 AS word-reader
WORKDIR /build
COPY apps/pyworker/legacy-word ./
RUN mvn --batch-mode --no-transfer-progress package

FROM worker-base AS pipeline
USER root
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=word-reader /opt/java/openjdk /opt/java/openjdk
COPY --from=word-reader /build/target/classes /opt/word/classes
COPY --from=word-reader /build/target/dependency /opt/word/lib
COPY apps/pyworker/requirements.pipeline.txt /tmp/requirements.pipeline.txt
RUN --mount=type=cache,target=/root/.cache/pip,id=formiq-pipeline,sharing=locked \
    python -m pip install --no-deps --index-url https://download.pytorch.org/whl/cpu \
    'torch==2.15.0+cpu' 'torchvision==0.29.2+cpu' \
    && python -m pip install -r /tmp/requirements.pipeline.txt \
    && python -m pip check
ENV PATH=/opt/java/openjdk/bin:$PATH \
    PYWORKER_DOC_CLASSPATH=/opt/word/classes:/opt/word/lib/* \
    PYWORKER_PIPELINE_ASSETS=/models \
    PYWORKER_FORM_MODE=pipeline \
    HOME=/tmp
COPY apps/pyworker/src ./src
USER worker

FROM runtime AS default
