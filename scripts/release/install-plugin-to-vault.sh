#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/ObsidianVault" >&2
  exit 1
fi

VAULT_DIR="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
PLUGIN_ID="$(node -p "require('$PLUGIN_DIR/manifest.json').id")"
TARGET_DIR="$VAULT_DIR/.obsidian/plugins/$PLUGIN_ID"

cd "$PLUGIN_DIR"
npm run build

required=("main.js" "manifest.json" "versions.json")
for file in "${required[@]}"; do
  if [[ ! -f "$PLUGIN_DIR/$file" ]]; then
    echo "Missing required plugin file: $file" >&2
    exit 1
  fi
done

mkdir -p "$TARGET_DIR"
cp "$PLUGIN_DIR/main.js" "$TARGET_DIR/main.js"
cp "$PLUGIN_DIR/manifest.json" "$TARGET_DIR/manifest.json"
cp "$PLUGIN_DIR/versions.json" "$TARGET_DIR/versions.json"
if [[ -f "$PLUGIN_DIR/styles.css" ]]; then
  cp "$PLUGIN_DIR/styles.css" "$TARGET_DIR/styles.css"
fi

echo "Installed plugin files to: $TARGET_DIR"
echo "Next steps in Obsidian:"
echo "1) Open Settings -> Community plugins"
echo "2) Enable Community plugins if disabled"
echo "3) In Installed plugins, enable: $PLUGIN_ID"
