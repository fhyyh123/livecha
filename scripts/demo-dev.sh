#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

VITE_PORT="${VITE_PORT:-5173}"
DEMO_PORT="${DEMO_PORT:-4173}"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_cmd npm
need_cmd python3

cleanup() {
  if [[ -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" >/dev/null 2>&1; then
    kill "$VITE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${DEMO_PID:-}" ]] && kill -0 "$DEMO_PID" >/dev/null 2>&1; then
    kill "$DEMO_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting Vite dev server on :$VITE_PORT"
pushd "$ROOT_DIR/frontend-agent" >/dev/null
npm run dev -- --port "$VITE_PORT" --strictPort &
VITE_PID=$!
popd >/dev/null

echo "Starting demo host page server on :$DEMO_PORT"
python3 -m http.server "$DEMO_PORT" --directory "$ROOT_DIR/docs" &
DEMO_PID=$!

echo
echo "Open:"
echo "- Demo (programmatic init): http://localhost:$DEMO_PORT/demo.html"
echo "- Demo (one-line snippet):  http://localhost:$DEMO_PORT/demo_snippet.html"
echo "- Agent console (dev):      http://localhost:$VITE_PORT"
echo

wait
