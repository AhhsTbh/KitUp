#!/usr/bin/env bash
# Refresh live stats, the meta tier list, meta builds and DMZ builds from codmunity.gg.
# Usage, from the repo root:  bash tools/refresh_meta.sh
# Then check `git diff --stat data/` before committing.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK="$(mktemp -d)"
mkdir -p "$WORK/pages"
python3 -I tools/crawl.py "$WORK/pages"
python3 -I tools/parse_stats.py "$WORK/pages" data/game.json "$WORK/stats.json"
python3 -I tools/parse_builds.py "$WORK/pages" data/game.json "$WORK/builds.json"
python3 -I tools/build_live.py data "$WORK/stats.json" "$WORK/builds.json" "$(date +%F)"
python3 -I tools/merge_dmz_builds.py data "$WORK/dmz-builds.json"
python3 -I -c "import json,glob; [json.load(open(f)) for f in glob.glob('data/*.json')]; print('all data files are valid JSON')"
rm -rf "$WORK"
