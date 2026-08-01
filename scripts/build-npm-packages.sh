#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:-dist/npm}"

usage() {
  cat <<USAGE
Usage: scripts/build-npm-packages.sh [OUT_DIR]

Build the platform-neutral npm package staging directory.
USAGE
}

if [[ "${out_dir:-}" == "--help" || "${out_dir:-}" == "-h" ]]; then
  usage
  exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

rm -rf packages/ts/memorax-code-backend/dist
npm ci --prefix packages/ts/memorax-code-backend
npm run build --prefix packages/ts/memorax-code-backend

node scripts/build-npm-packages.mjs --out-dir "$out_dir"
