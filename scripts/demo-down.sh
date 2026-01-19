#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Missing required command: docker" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Missing required command: docker compose" >&2
  exit 1
fi

pushd "$ROOT_DIR/infra" >/dev/null
docker compose down
popd >/dev/null

echo "Infra stopped." 
