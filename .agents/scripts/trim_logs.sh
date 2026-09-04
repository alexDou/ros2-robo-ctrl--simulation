#!/usr/bin/env bash
# Trim large log files in workspace log/ and ~/.ros/log/ to prevent context overflow and disk bloat.
set -eo pipefail

MAX_LINES=500
MAX_BYTES=1048576 # 1MB

trim_file() {
  local f="$1"
  if [ -f "$f" ]; then
    local size
    size=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_BYTES" ]; then
      tail -n "$MAX_LINES" "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
    fi
  fi
}

# Trim local project logs if directory exists
if [ -d "log" ]; then
  find log -type f -name "*.log" 2>/dev/null | while read -r file; do
    trim_file "$file"
  done
fi

# Clean old ROS2 log directories (>3 days old)
if [ -d "$HOME/.ros/log" ]; then
  find "$HOME/.ros/log" -mindepth 1 -maxdepth 1 -type d -mtime +3 -exec rm -rf {} + 2>/dev/null || true
fi
