#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/plugin"
OUT_DIR="$ROOT_DIR/dist/plugin-release"

cd "$PLUGIN_DIR"
npm run build

required=("main.js" "manifest.json")
optional=("styles.css")

for file in "${required[@]}"; do
  if [[ ! -f "$PLUGIN_DIR/$file" ]]; then
    echo "Missing required release asset: $file" >&2
    exit 1
  fi
done

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp "$PLUGIN_DIR/main.js" "$OUT_DIR/main.js"
cp "$PLUGIN_DIR/manifest.json" "$OUT_DIR/manifest.json"
cp "$PLUGIN_DIR/versions.json" "$OUT_DIR/versions.json"

if [[ -f "$PLUGIN_DIR/styles.css" ]]; then
  cp "$PLUGIN_DIR/styles.css" "$OUT_DIR/styles.css"
fi

echo "Prepared plugin release assets in: $OUT_DIR"
ls -1 "$OUT_DIR"
