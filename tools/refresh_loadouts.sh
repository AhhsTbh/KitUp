#!/usr/bin/env bash
# Refresh data/loadouts.json (Warzone, DMZ, Resurgence, and Multiplayer gap-fill loadouts) from the stats source.
# Does not touch Multiplayer stats or data/meta.json. Usage from the repo root:  bash tools/refresh_loadouts.sh
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="$(mktemp -d)"; mkdir -p "$WORK/pages"
python3 -I tools/crawl.py "$WORK/pages"
python3 -I tools/parse_loadouts.py "$WORK/pages" data/game.json data/attachments.json data/loadouts.json
python3 -I tools/apply_wz_overrides.py data
python3 -I tools/validate_data.py
rm -rf "$WORK"
