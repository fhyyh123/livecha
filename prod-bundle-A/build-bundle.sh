#!/usr/bin/env bash
set -euo pipefail

# Build + export docker image tar into prod-bundle-A/ for offline deployment.
# Usage:
#   ./prod-bundle-A/build-bundle.sh                 # auto tag
#   ./prod-bundle-A/build-bundle.sh prod-20260111   # custom tag

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

DATE_TAG="$(date +%Y%m%d-%H%M%S)"
DEFAULT_TAG="prod-${DATE_TAG}"
TAG="${1:-$DEFAULT_TAG}"
IMAGE="chatlive-backend:${TAG}"
OUT_TAR="$SCRIPT_DIR/chatlive-backend_${TAG}.tar"

echo "[1/3] Building backend jar..."
(cd backend && mvn -q -DskipTests package)

echo "[2/3] Building docker image: ${IMAGE}"
docker build -t "$IMAGE" backend

echo "[3/3] Exporting image tar: ${OUT_TAR}"
docker save "$IMAGE" -o "$OUT_TAR"

echo ""
echo "Done. Next on production host:"
echo "  1) copy prod-bundle-A/ to server"
echo "  2) docker load -i chatlive-backend_${TAG}.tar"
echo "  3) cp .env.prod.example .env  # edit secrets"
echo "  4) set CHATLIVE_BACKEND_IMAGE_TAG=${TAG} in .env"
echo "  5) docker compose --env-file .env -f docker-compose.prod.yml up -d"
