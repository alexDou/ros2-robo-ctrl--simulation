#!/usr/bin/env bash
set -eo pipefail

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$PROJECT_ROOT/web"

WEB_PID=""

on_signal() {
    trap - SIGINT SIGTERM
    echo ""
    echo "[launch_web.sh] Caught termination signal. Cleaning up background processes..."
    if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
        echo "[launch_web.sh] Stopping Vite dev server (PID: $WEB_PID)..."
        kill -TERM -"$WEB_PID" 2>/dev/null || kill -TERM "$WEB_PID" 2>/dev/null || true
        wait "$WEB_PID" 2>/dev/null || true
    fi
    echo "[launch_web.sh] All processes terminated."
    exit 0
}

trap on_signal SIGINT SIGTERM

echo "[launch_web.sh] Launching Vite dev server..."
cd "$WEB_DIR"
npm run dev -- "$@" &
WEB_PID=$!
echo "[launch_web.sh] Vite dev server running (PID: $WEB_PID)"

# Wait for Vite dev server process to exit or be killed
set +e
wait "$WEB_PID"
WEB_EXIT=$?
set -e

exit "$WEB_EXIT"
