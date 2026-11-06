"""Meta Intelligence statuses from official patch notes only. Run from the repo root: python3 -I tools/build_meta_intel.py [--today YYYY-MM-DD]
A gun is 'Recently buffed', 'Recently nerfed' or 'Recently changed' when its newest patch change is within 14 days.
Rising / Stable / Falling are NOT assigned: they need pick-rate history, and history.json is too short (under 14 days) to support them."""
import datetime, json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
today = datetime.date.fromisoformat(sys.argv[sys.argv.index('--today') + 1]) if '--today' in sys.argv else datetime.date.today()
patches = sorted(json.load(open(os.path.join(ROOT, 'data/patches.json'))), key=lambda p: p['date'])
hist = json.load(open(os.path.join(ROOT, 'data/history.json')))
LABEL = {'buff': 'Recently buffed', 'nerf': 'Recently nerfed', 'adjust': 'Recently changed'}
latest = {}
for p in patches:
    for c in p.get('changes', []):
        if c.get('weapon'): latest[c['weapon']] = {'type': c['type'], 'date': p['date'], 'patch': p.get('title', '')}
out = {'generated': today.isoformat(), 'trend': {'status': 'data_unavailable', 'days': len(hist.get('days', [])),
       'reason': 'Rising, Stable and Falling need at least 14 days of pick-rate history.'} if len(hist.get('days', [])) < 14 else {'status': 'available'}, 'weapons': {}}
for w, c in latest.items():
    if (today - datetime.date.fromisoformat(c['date'])).days <= 14:
        out['weapons'][w] = {'status': LABEL[c['type']], 'date': c['date'], 'patch': c['patch']}
json.dump(out, open(os.path.join(ROOT, 'data/metaintel.json'), 'w'), indent=1)
print(f'{len(out["weapons"])} guns with a recent official change; trend labels: {out["trend"]["status"]}')
