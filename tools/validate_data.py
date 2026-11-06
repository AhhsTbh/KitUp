"""Kit Up data checks. Run from the repo root:  python3 -I tools/validate_data.py
Exits 1 if anything is wrong, so it can gate a data update. Warnings don't fail the run.
Checks: missing images, bad or duplicate weapon records, attachment names that don't exist, impossible stats,
meta builds that don't match the attachment data, broken map and gear image paths, patch notes pointing at unknown guns."""
import base64, datetime, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'data')
errors, warnings = [], []
err = lambda m: errors.append(m)
warn = lambda m: warnings.append(m)
load = lambda n: json.load(open(os.path.join(D, n), encoding='utf-8'))
exists = lambda p: bool(p) and os.path.isfile(os.path.join(ROOT, p))

game, att, meta, tiers = load('game.json'), load('attachments.json'), load('meta.json'), load('tiers.json')
W = {}
# ---- weapons ----
for w in game['weapons']:
    if w['id'] in W: err(f"duplicate weapon id {w['id']}")
    W[w['id']] = w
names = [w['name'].lower() for w in game['weapons']]
for n in set(names):
    if names.count(n) > 1: err(f'duplicate weapon name {n}')
cats = {c['id'] for c in game['categories']}
for w in game['weapons']:
    i = w['id']
    if w.get('cat') not in cats: err(f'{i}: unknown category {w.get("cat")}')
    if not exists(w.get('photo')): err(f'{i}: missing weapon image {w.get("photo")}')
    if w.get('apex') and not exists(w.get('apexPhoto')): err(f'{i}: missing Apex image {w.get("apexPhoto")}')
    if w['cat'] not in ('launcher', 'melee') and not w.get('slots'): err(f'{i}: no attachment slots')
    if len(set(w.get('slots', []))) != len(w.get('slots', [])): err(f'{i}: duplicate slots')
    l = w.get('live') or {}
    if l:
        for k, v in l.items():
            if not isinstance(v, (int, float)) or isinstance(v, bool): err(f'{i}: live.{k} is not a number ({v!r})')
            elif v < 0: err(f'{i}: live.{k} is negative ({v})')
        t = [l.get('ttk' + r) for r in ('15', '40', '80', '100')]
        if all(x is not None for x in t) and any(t[j] > t[j + 1] for j in range(3)) and t[0] != 0:
            warn(f'{i}: kill time gets faster with distance {t}')
        if l.get('rpm') is not None and w['cat'] not in ('launcher', 'melee') and not (30 <= l['rpm'] <= 3000): err(f'{i}: fire rate {l["rpm"]} looks wrong')
        if w.get('rpm') and l.get('rpm') and abs(w['rpm'] - l['rpm']) / w['rpm'] > .25: warn(f'{i}: base rpm {w["rpm"]} vs live {l["rpm"]} differ a lot')
    elif w['cat'] not in ('launcher', 'melee'): warn(f'{i}: no live stats')
# ---- gear and operator images ----
for key in ('perks', 'lethals', 'tacticals', 'fieldUpgrades', 'killstreaks', 'operators'):
    ids = set()
    for x in game.get(key, []):
        k = x.get('id') or x.get('name')
        if k in ids: err(f'{key}: duplicate {k}')
        ids.add(k)
        if x.get('img') and not exists(x['img']): err(f'{key}/{k}: missing image {x["img"]}')
for c in game.get('camos', []):
    for f in ('img', 'photo'):
        if isinstance(c, dict) and c.get(f) and not exists(c[f]): warn(f'camo {c.get("name")}: missing image {c[f]}')
# ---- attachments ----
for wid, items in att.items():
    if wid not in W: err(f'attachments: unknown gun {wid}'); continue
    seen = set()
    for it in items:
        key = (it['s'], it['n'])
        if key in seen: err(f'{wid}: duplicate attachment {key}')
        seen.add(key)
        if it['s'] not in W[wid].get('slots', []): err(f'{wid}: {it["n"]} is in slot {it["s"]}, which the gun does not have')
        if it.get('l') is not None and W[wid].get('levels') and it['l'] > W[wid]['levels']: warn(f'{wid}: {it["n"]} unlocks at level {it["l"]}, above the gun max {W[wid]["levels"]}')
        for t in (it.get('u') or []) + (it.get('d') or []):
            if not re.match(r'^[-+]?\d+(\.\d+)?%?\s+\S', t): warn(f'{wid}: odd stat text {t!r} on {it["n"]}')
for wid, w in W.items():
    if w['cat'] not in ('launcher', 'melee') and wid not in att: warn(f'{wid}: no attachment data')
# ---- meta builds ----
def decode(code):
    b = code[2:] if code.startswith('l-') else code
    b += '=' * (-len(b) % 4)
    return json.loads(base64.urlsafe_b64decode(b))
for m in meta:
    w = m['w']
    if w not in W: err(f'meta: unknown gun {w}'); continue
    slots = [a['s'] for a in m['att']]
    if len(set(slots)) != len(slots): err(f'meta {m["name"]}: two attachments in one slot')
    if len(slots) > 5: err(f'meta {m["name"]}: more than 5 attachments')
    have = {(i['s'], i['n']) for i in att.get(w, [])}
    for a in m['att']:
        if (a['s'], a['n']) not in have: err(f'meta {m["name"]}: {a["n"]} ({a["s"]}) is not in the attachment data for {w}')
    try:
        o = decode(m['code'])
        slot = o['s'] if m.get('side') else o['p']
        if slot[0] != w or [(a[0], a[1]) for a in slot[2]] != [(a['s'], a['n']) for a in m['att']]: err(f'meta {m["name"]}: share code does not match its attachments')
    except Exception as e:
        err(f'meta {m["name"]}: share code will not decode ({e})')
# ---- tiers and history ----
for t in tiers['tiers']:
    for i in t['ids']:
        if i not in W: err(f'tiers: unknown gun {i}')
for i in tiers.get('picks', {}):
    if i not in W: err(f'tiers.picks: unknown gun {i}')
h = load('history.json')
for k in ('picks', 'tiers'):
    for i, arr in h.get(k, {}).items():
        if len(arr) != len(h['days']): err(f'history.{k}.{i}: {len(arr)} values for {len(h["days"])} days')
# ---- maps ----
maps = load('maps.json')
for p in maps.get('playlists', []):
    for m in p.get('maps', []):
        for f in ('img', 'layout'):
            if m.get(f) and not exists(m[f]): err(f'map {m["n"]}: missing {f} image {m[f]}')
        for s in m.get('shots', []):
            if not exists(s): err(f'map {m["n"]}: missing screenshot {s}')
        if not m.get('img'): warn(f'map {m["n"]}: no image')
# ---- patches ----
CH = {'buff', 'nerf', 'adjust'}
for p in load('patches.json'):
    try: datetime.date.fromisoformat(p['date'])
    except Exception: err(f'patch {p.get("title")}: bad date {p.get("date")}')
    if p.get('url') and not p['url'].startswith('https://'): err(f'patch {p["title"]}: url is not https')
    for c in p.get('changes', []):
        if 'weapon' not in c and 'item' not in c: err(f'patch {p["title"]}: change has neither a gun nor an item')
        if 'weapon' in c and c['weapon'] not in W: err(f'patch {p["title"]}: unknown gun {c["weapon"]}')
        if c['type'] not in CH: err(f'patch {p["title"]}: unknown change type {c["type"]}')
# ---- dmz builds ----
dmz = load('dmz.json')
for b in dmz.get('builds', []):
    if b['w'] not in W: err(f'dmz: unknown gun {b["w"]}'); continue
    have = {(i['s'], i['n']) for i in att.get(b['w'], [])}
    for a in b['att']:
        if a['s'] != 'Apex' and (a['s'], a['n']) not in have: warn(f'dmz {b["w"]}: {a["n"]} ({a["s"]}) is not in the attachment data')

# ---- modes and trust ----
modes = load('modes.json')['modes']
if {m['id'] for m in modes} != {'mp', 'dmz', 'warzone', 'resurgence'}: err('modes.json must list mp, dmz, warzone and resurgence')
for m in modes:
    if m['status'] not in ('available', 'data_unavailable', 'uses_warzone'): err(f'mode {m["id"]}: unknown status {m["status"]}')
    if m['status'] == 'data_unavailable' and not m.get('reason'): err(f'mode {m["id"]}: unavailable but gives no reason')
    if m['status'] == 'available':
        for f in m.get('data', []):
            if not os.path.isfile(os.path.join(D, f)): err(f'mode {m["id"]}: data file {f} is missing')
live_day = datetime.date.fromisoformat(game['meta']['liveUpdated'])
if (datetime.date.today() - live_day).days > 14: warn(f'live stats were measured {live_day}, over 14 days ago')
newer = [p for p in load('patches.json') if datetime.date.fromisoformat(p['date']) > live_day]
if newer: warn(f'{len(newer)} patch(es) newer than the live stats ({live_day}); affected builds may be out of date')
if os.path.isfile(os.path.join(D, 'trust.json')):
    tr = load('trust.json')
    for i in tr['weapons']:
        if i not in W: err(f'trust.json: unknown gun {i}')
    for k, v in tr['components'].items():
        if not 0 <= v['value'] <= 100: err(f'trust.json: {k} out of range')
    if tr['liveStatsMeasured'] != game['meta']['liveUpdated']: err('trust.json is out of date: run python3 -I tools/build_trust.py')
else: warn('data/trust.json missing: run python3 -I tools/build_trust.py')

# ---- per-mode loadouts ----
if os.path.isfile(os.path.join(D, 'loadouts.json')):
    LO = load('loadouts.json')['modes']
    for mode, guns in LO.items():
        for wid, builds in guns.items():
            if wid not in W: err(f'loadouts.{mode}: unknown gun {wid}'); continue
            for b in builds:
                sl = [a['s'] for a in b['att']]
                if len(sl) > 5 or len(set(sl)) != len(sl): err(f'loadouts.{mode}.{wid} {b["n"]}: too many attachments or two in one slot')
                for a in b['att']:
                    if a['s'] != 'Apex' and a['s'] not in W[wid].get('slots', []): err(f'loadouts.{mode}.{wid}: slot {a["s"]} not on this gun')
                known = {(i['s'], i['n']) for i in att.get(wid, [])}
                for a in b['att']:
                    if a['s'] != 'Apex' and (a['s'], a['n']) not in known and a['n'] not in b.get('unverified', []): err(f'loadouts.{mode}.{wid}: {a["n"]} unknown and not flagged unverified')
    if LO.get('resurgence'): warn('resurgence loadouts present: confirm they are verifiable before enabling the view')
    for wid, w in W.items():
        if w['cat'] not in ('launcher', 'melee') and w.get('live') and wid not in LO.get('warzone', {}): warn(f'{wid}: no Warzone loadout')

for w in warnings: print('warn ', w)
for e in errors: print('ERROR', e)
print(f'{len(errors)} errors, {len(warnings)} warnings')
sys.exit(1 if errors else 0)
