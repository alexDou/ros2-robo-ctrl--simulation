#!/usr/bin/env bash
set -eo pipefail

# Resolve script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Find zenoh-bridge-ros2dds binary
ZENOH_BRIDGE=""
if command -v zenoh-bridge-ros2dds &> /dev/null; then
    ZENOH_BRIDGE="zenoh-bridge-ros2dds"
elif [ -x "$HOME/.cargo/bin/zenoh-bridge-ros2dds" ]; then
    ZENOH_BRIDGE="$HOME/.cargo/bin/zenoh-bridge-ros2dds"
else
    echo "ERROR: zenoh-bridge-ros2dds not found in PATH or ~/.cargo/bin" >&2
    echo "Install via: cargo install zenoh-bridge-ros2dds --locked" >&2
    exit 1
fi

ZENOH_BRIDGE_PID=""
GATEWAY_PID=""

cleanup() {
    trap - SIGINT SIGTERM EXIT
    echo ""
    echo "[launch_gateway.sh] Caught termination signal. Cleaning up background processes..."
    if [ -n "$GATEWAY_PID" ] && kill -0 "$GATEWAY_PID" 2>/dev/null; then
        echo "[launch_gateway.sh] Stopping Gateway (PID: $GATEWAY_PID)..."
        kill -TERM "$GATEWAY_PID" 2>/dev/null || true
    fi
    if [ -n "$ZENOH_BRIDGE_PID" ] && kill -0 "$ZENOH_BRIDGE_PID" 2>/dev/null; then
        echo "[launch_gateway.sh] Stopping zenoh-bridge-ros2dds (PID: $ZENOH_BRIDGE_PID)..."
        kill -TERM "$ZENOH_BRIDGE_PID" 2>/dev/null || true
    fi
    wait "$GATEWAY_PID" 2>/dev/null || true
    wait "$ZENOH_BRIDGE_PID" 2>/dev/null || true
    echo "[launch_gateway.sh] All processes terminated."
}

trap cleanup SIGINT SIGTERM EXIT

echo "[launch_gateway.sh] Launching zenoh-bridge-ros2dds..."
"$ZENOH_BRIDGE" &
ZENOH_BRIDGE_PID=$!
echo "[launch_gateway.sh] zenoh-bridge-ros2dds running (PID: $ZENOH_BRIDGE_PID)"

echo "[launch_gateway.sh] Building Gateway service..."
cd "$PROJECT_ROOT"
cargo build -p gateway

echo "[launch_gateway.sh] Launching Gateway service ($PROJECT_ROOT/target/debug/gateway)..."
"$PROJECT_ROOT/target/debug/gateway" &
GATEWAY_PID=$!
echo "[launch_gateway.sh] Gateway running (PID: $GATEWAY_PID)"

# Wait for gateway process to exit or be killed
wait "$GATEWAY_PID"
GATEWAY_EXIT=$?

# Untrap EXIT so cleanup isn't called redundantly
trap - EXIT
cleanup
exit "$GATEWAY_EXIT"
