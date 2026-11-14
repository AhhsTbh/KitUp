"""Put the hand-checked Warzone builds (data/warzone_overrides.json) on top of data/loadouts.json.
Usage: python3 -I tools/apply_wz_overrides.py data   (safe to run again; it replaces its own earlier entries)
Names are matched to data/attachments.json; one that is not in that table is kept and flagged 'unverified', like the parser does."""
import json, os, re, sys
D = sys.argv[1]; P = lambda n: os.path.join(D, n)
if not os.path.exists(P('warzone_overrides.json')): sys.exit(0)
OV = {k: v for k, v in json.load(open(P('warzone_overrides.json'))).items() if not k.startswith('_')}
W = {w['id']: w for w in json.load(open(P('game.json')))['weapons']}; A = json.load(open(P('attachments.json')))
lo = json.load(open(P('loadouts.json'))); wz = lo['modes'].setdefault('warzone', {})
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
key = lambda b: sorted(norm(a['n']) for a in b['att'])
for wid, o in OV.items():
    if wid not in W: sys.exit(f'warzone_overrides.json: unknown gun {wid}')
    att, bad = [], []
    for s, n in o['att']:
        hit = next((i for i in A.get(wid, []) if norm(i['n']) == norm(n) or norm(i['n']) == norm(n).replace('drummag', 'drum') or norm(i['n']) + 'mag' == norm(n)), None)
        if hit: att.append({'s': hit['s'], 'n': hit['n']})
        else: att.append({'s': s, 'n': n}); bad.append(n)
    sl = [a['s'] for a in att]
    if len(att) > 5 or len(set(sl)) != len(sl) or any(s not in W[wid].get('slots', []) for s in sl): sys.exit(f'warzone_overrides.json: {wid} has a bad slot, a doubled slot or over 5 attachments: {sl}')
    rest = [b for b in wz.get(wid, []) if not b.get('hand')]
    new = {'n': 'Meta', 'top': True, 'rank': 1, 'updated': o.get('updated'), 'hand': True, 'att': att, **({'unverified': bad} if bad else {})}
    same = next((b for b in rest if key(b) == key(new)), None)
    if same:  # the live source already agrees: keep its entry (it carries the TTK) and just make sure it is first
        rest.remove(same); wz[wid] = [same] + rest
    else:
        for b in rest: b['top'] = False
        wz[wid] = [new] + rest
    print(wid, 'same as live' if same else 'override', ('unverified: ' + ', '.join(bad)) if bad else '')
json.dump(lo, open(P('loadouts.json'), 'w'), indent=1, ensure_ascii=False)
