#!/bin/sh
# Hurricane and Snow pipeline tests. Local only. No network, no AWS account.
# RoyalTree is separate: uv run --directory src/Royalty/Data pytest
set -eu
cd "$(dirname "$0")"
ROOT=$(pwd)
uv sync --frozen --directory src/pipeline_testing
PYTHONPATH="$ROOT/src${PYTHONPATH:+:$PYTHONPATH}" \
  uv run --directory src/pipeline_testing --frozen \
  pytest -p pipeline_testing.guards --disable-socket --import-mode=importlib \
  --rootdir "$ROOT/src" \
  "$ROOT/src/Hurricane/tests" \
  "$ROOT/src/Snow/tests"
