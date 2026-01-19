#!/usr/bin/env bash
set -euo pipefail

# Offline deploy helper (run on production host).
# Assumes you copied the entire prod-bundle-A/ directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Create it from .env.prod.example first." >&2
  exit 1
fi

# Load the newest exported backend tar in this directory.
TAR_FILE="$(ls -1t chatlive-backend_*.tar 2>/dev/null | head -n 1 || true)"
if [[ -z "$TAR_FILE" ]]; then
  echo "No chatlive-backend_*.tar found in $SCRIPT_DIR" >&2
  exit 1
fi

echo "Loading image tar: $TAR_FILE"
docker load -i "$TAR_FILE"

TAR_TAG="${TAR_FILE#chatlive-backend_}"
TAR_TAG="${TAR_TAG%.tar}"

ENV_TAG=""
if grep -q '^CHATLIVE_BACKEND_IMAGE_TAG=' .env; then
  ENV_TAG="$(grep '^CHATLIVE_BACKEND_IMAGE_TAG=' .env | tail -n 1 | cut -d '=' -f 2-)"
fi

if [[ -n "$ENV_TAG" && "$ENV_TAG" != "$TAR_TAG" ]]; then
  echo "WARNING: .env CHATLIVE_BACKEND_IMAGE_TAG=$ENV_TAG but tar tag is $TAR_TAG" >&2
  echo "         Update .env to CHATLIVE_BACKEND_IMAGE_TAG=$TAR_TAG to run the newly loaded image." >&2
fi

echo "Starting docker compose..."
docker compose --env-file .env -f docker-compose.prod.yml up -d

echo "Done. Check status with: docker compose -f docker-compose.prod.yml ps"
