"""Kit Up data trust report. Run from the repo root:  python3 -I tools/build_trust.py [--today YYYY-MM-DD]
Writes data/trust.json (public: dates, completeness, confidence labels, no source names)
and tools/trust_report.json (internal: full breakdown with sources).

The score is calculated, never typed in. Rules (also in tools/TRUST.md):
  completeness  (weight 35)  share of expected stat fields present on each weapon, averaged
  recency       (weight 30)  100 if live stats are 3 days old or less, falling in a straight line to 0 at 30 days
  patch_fit     (weight 25)  share of weapons NOT changed by an official patch newer than the live stats
  reliability   (weight 10)  weighted by source class (official 100, third-party measured 70, usage 60)
  agreement     (not scored) needs two independent measurements; we have one, so it is reported as unavailable
                             and the remaining weights are rescaled to 100.
Per-weapon confidence: High (>=90 completeness, not patch-affected), Medium (>=60 or patch-affected), Low (below 60)."""
import datetime, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load = lambda p: json.load(open(os.path.join(ROOT, p), encoding='utf-8'))
today = datetime.date.fromisoformat(sys.argv[sys.argv.index('--today') + 1]) if '--today' in sys.argv else datetime.date.today()

game, patches, prov = load('data/game.json'), load('data/patches.json'), load('tools/provenance.json')
live_date = datetime.date.fromisoformat(game['meta']['liveUpdated'])
NO_STATS = ('launcher', 'melee')
EXPECTED = ['kick', 'hRecoil', 'vRecoil', 'rpm', 'ttk15', 'ttk40', 'ttk80', 'ttk100', 'ads', 'stf', 'reload', 'mag', 'vel', 'move', 'adsMove', 'sprint', 'tac']

# weapons changed by a patch dated after the live stats were measured
affected = {}
for p in patches:
    if datetime.date.fromisoformat(p['date']) > live_date:
        for c in p.get('changes', []):
            if c.get('weapon'): affected.setdefault(c['weapon'], p['date'])

rows = {}
for w in game['weapons']:
    if w['cat'] in NO_STATS: continue
    l = w.get('live') or {}
    missing = [k for k in EXPECTED if l.get(k) is None]
    comp = round(100 * (len(EXPECTED) - len(missing)) / len(EXPECTED))
    patched = w['id'] in affected
    conf = 'Low' if comp < 60 else ('Medium' if (comp < 90 or patched) else 'High')
    rows[w['id']] = {'completeness': comp, 'missing': missing, 'patchAffected': patched, 'confidence': conf, 'measured': game['meta']['liveUpdated']}

n = len(rows)
completeness = sum(r['completeness'] for r in rows.values()) / n
age = (today - live_date).days
recency = max(0, min(100, 100 * (30 - age) / 27)) if age > 3 else 100
patch_fit = 100 * sum(1 for r in rows.values() if not r['patchAffected']) / n
cls = prov['source_class_reliability']
live_cls = prov['datasets']['game.weapons.live']['source_class']
reliability = cls[live_cls]
W = {'completeness': 35, 'recency': 30, 'patch_fit': 25, 'reliability': 10}
parts = {'completeness': completeness, 'recency': recency, 'patch_fit': patch_fit, 'reliability': reliability}
score = round(sum(parts[k] * W[k] for k in W) / sum(W.values()))

report = {
    'generated': today.isoformat(), 'score': score,
    'components': {k: {'value': round(v), 'weight': W[k]} for k, v in parts.items()},
    'agreement': {'status': 'data_unavailable', 'reason': 'Only one measurement source; independent agreement cannot be calculated.'},
    'liveStatsMeasured': game['meta']['liveUpdated'], 'liveStatsAgeDays': age,
    'weaponsScored': n, 'patchAffected': sorted(affected), 'weapons': rows,
    'sources': {k: {'source': v['source'], 'class': v['source_class']} for k, v in prov['datasets'].items()},
}
public = {
    'generated': today.isoformat(), 'score': score,
    'components': report['components'], 'agreement': report['agreement'],
    'liveStatsMeasured': report['liveStatsMeasured'], 'liveStatsAgeDays': age,
    'weapons': {i: {'confidence': r['confidence'], 'completeness': r['completeness'], 'patchAffected': r['patchAffected'],
                    'unavailable': r['missing']} for i, r in rows.items()},
}
json.dump(public, open(os.path.join(ROOT, 'data/trust.json'), 'w'), indent=1)
json.dump(report, open(os.path.join(ROOT, 'tools/trust_report.json'), 'w'), indent=1)
print(f'Trust score {score}/100 · live stats {age} days old · {len(affected)} of {n} weapons changed by a newer patch · completeness {round(completeness)}%')
