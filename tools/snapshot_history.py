"""Save today's pick rates and tiers into data/history.json (one snapshot per day, last 90 days).
Usage: python3 tools/snapshot_history.py data"""
import json, os, sys

D = sys.argv[1]
tiers = json.load(open(os.path.join(D, 'tiers.json'), encoding='utf-8'))
path = os.path.join(D, 'history.json')
h = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {'days': [], 'picks': {}, 'tiers': {}}

day = tiers['updated']
tier = {i: t['t'] for t in tiers['tiers'] for i in t['ids']}
picks = tiers.get('picks', {})
if not h['days'] or h['days'][-1] != day:
    h['days'].append(day)
idx = len(h['days']) - 1

for i in sorted(set(picks) | set(tier) | set(h['picks']) | set(h['tiers'])):
    for key, val in (('picks', picks.get(i)), ('tiers', tier.get(i))):
        arr = h[key].setdefault(i, [])
        while len(arr) < len(h['days']):
            arr.append(None)
        arr[idx] = val

KEEP = 90
if len(h['days']) > KEEP:
    cut = len(h['days']) - KEEP
    h['days'] = h['days'][cut:]
    for key in ('picks', 'tiers'):
        for i in h[key]:
            h[key][i] = h[key][i][cut:]

with open(path, 'w', encoding='utf-8') as f:
    json.dump(h, f, separators=(',', ':'))
    f.write('\n')
print('history:', len(h['days']), 'days, latest', h['days'][-1])
