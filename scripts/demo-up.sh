#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd mvn
need_cmd docker
need_cmd npm

if ! docker compose version >/dev/null 2>&1; then
  echo "Missing required command: docker compose" >&2
  exit 1
fi

echo "[1/3] Building backend jar (skip tests)"
pushd "$ROOT_DIR/backend" >/dev/null
mvn -DskipTests package
popd >/dev/null

echo "[2/3] Starting infra (postgres/redis/minio/backend/nginx)"
pushd "$ROOT_DIR/infra" >/dev/null
docker compose up -d --build
popd >/dev/null

echo "[3/3] Ensuring frontend dependencies"
pushd "$ROOT_DIR/frontend-agent" >/dev/null
if [[ ! -d node_modules ]]; then
  npm install
fi
popd >/dev/null

echo
echo "Infra is up." 
echo "- Nginx gateway:        http://localhost:8088"
echo "- Backend (direct):     http://localhost:8080"
echo "- Widget script (via):  http://localhost:8088/chatlive/widget.js"
echo
echo "Next (in another terminal or run ./scripts/demo-dev.sh):"
echo "  - Start visitor/agent dev UI:  cd frontend-agent && npm run dev"
echo "  - Start demo host page:        cd docs && python3 -m http.server 4173"
echo
