import base64, datetime, json, os, re, sys

D, STATS, BUILDS = sys.argv[1], sys.argv[2], sys.argv[3]
load = lambda n: json.load(open(os.path.join(D, n)))
def save(n, o, compact=False):
    with open(os.path.join(D, n), 'w') as f:
        json.dump(o, f, ensure_ascii=False, **({'separators': (',', ':')} if compact else {'indent': 2}))
        f.write('\n')

g = load('game.json'); W = {w['id']: w for w in g['weapons']}
ST = json.load(open(STATS)); BL = json.load(open(BUILDS))
A = load('attachments.json')
UPDATED = sys.argv[4] if len(sys.argv) > 4 else datetime.date.today().isoformat()

# ---- live stats + meta status on each weapon ----
for w in g['weapons']:
    s = ST['stats'].get(w['id'])
    if s:
        w['live'] = {k: v for k, v in s.items()}
    p = ST['picks'].get(w['id'])
    if p:
        w['metaStatus'] = p['status']; w['pick'] = p['pick']
g['meta']['liveUpdated'] = UPDATED
g['meta']['liveSource'] = 'https://codmunity.gg/weapon/mw4/m4'
save('game.json', g)

# ---- live tier list ----
prim = lambda wid: W[wid]['cat'] not in ('pistol', 'launcher', 'melee')
picks = ST['picks']
def tier_ids(status, primary=True):
    ids = [k for k, v in picks.items() if v['status'] == status and (prim(k) if primary else W[k]['cat'] == 'pistol')]
    return sorted(ids, key=lambda k: (-picks[k]['pick'], W[k]['name']))
tiers = {
    'updated': UPDATED, 'label': 'Live meta',
    'note': 'From live match data: each gun\'s meta status and how often players pick it. Pick rate shows popularity, not raw power, so starter guns like the Han 86 run high.',
    'tiers': [
        {'t': 'S', 'label': 'Absolute meta', 'ids': tier_ids('Absolute Meta')},
        {'t': 'A', 'label': 'Meta', 'ids': tier_ids('Meta')},
        {'t': 'B', 'label': 'Contender', 'ids': tier_ids('Contender')},
        {'t': '2nd', 'label': 'Sidearms', 'ids': tier_ids('Very Good', primary=False)},
    ],
    'picks': {k: v['pick'] for k, v in picks.items()},
    'sources': [['codmunity.gg live meta', 'https://codmunity.gg/weapon/mw4/m4']],
}
save('tiers.json', tiers)
TIER = {i: t['t'] for t in tiers['tiers'] for i in t['ids']}

# ---- meta builds from each S/A gun's #1 live Multiplayer build ----
CAT = {
    'ar':  dict(s='krait-p68', lethal='frag', tactical='flash', fu='portable-radar', perks=['quick-fix', 'blood-rush', 'combat-grid'], ks=['uav', 'artillery-beacon', 'attack-helicopter']),
    'smg': dict(s='krait-p68', lethal='sticky', tactical='flash', fu='portable-radar', perks=['quick-fix', 'blood-rush', 'tracker'], ks=['uav', 'bomb-glider', 'combat-drone']),
    'sg':  dict(s='krait-p68', lethal='sticky', tactical='concussion', fu='portable-radar', perks=['quick-fix', 'blood-rush', 'lethal-reach'], ks=['uav', 'bomb-glider', 'crossfire']),
    'lmg': dict(s='sang-9mm', lethal='trip-wire', tactical='smoke', fu='trophy-system', perks=['resupply', 'bomb-squad', 'scavenger'], ks=['uav', 'railgun-sentry', 'attack-helicopter']),
    'mr':  dict(s='sang-9mm', lethal='claymore', tactical='snapshot', fu='portable-radar', perks=['high-alert', 'fast-hands', 'cold-blooded'], ks=['uav', 'missile-salvo', 'advanced-uav']),
    'sr':  dict(s='sang-9mm', lethal='claymore', tactical='smoke', fu='recon-drone', perks=['high-alert', 'fast-hands', 'cold-blooded'], ks=['uav', 'counter-uav', 'advanced-uav']),
}
ROLE = {'ar': 'Assault rifle', 'smg': 'SMG', 'sg': 'Shotgun', 'lmg': 'LMG', 'mr': 'Marksman', 'sr': 'Sniper'}
REV = {'x58-nyx': 'x-58-nyx', 'kg7-vulcan': 'kg-7-vulcan', 'pm40-anvil': 'pm-40-anvil', 'fss-carbon-edge': 'fss-carbon-edge-1095'}
STYLES = ['Long Range', 'Close Range', 'Easiest To Use', 'Versatile', 'Sniper']
names = {(wid, it['s'], it['n'].lower()): it['n'] for wid, items in A.items() for it in items}

def code(o):
    raw = json.dumps(o, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    return 'l-' + base64.urlsafe_b64encode(raw).decode().rstrip('=')

def note_for(w):
    lv, p = w.get('live', {}), w.get('pick')
    bits = []
    if lv.get('ttk15') == 0: bits.append('One-shot kills up close')
    elif lv.get('ttk15'): bits.append(f"{lv['ttk15']} ms TTK up close")
    if lv.get('ttk40'): bits.append(f"{lv['ttk40']} ms at mid range")
    if lv.get('ads'): bits.append(f"{lv['ads']} ms ADS")
    s = ', '.join(bits)
    return (s[0].upper() + s[1:] + '.' if s else '') + (f' Picked in {p}% of live loadouts.' if p is not None else '')

meta = []
for t in tiers['tiers'][:2]:
    for wid in t['ids']:
        w = W[wid]; builds = BL.get(wid) or []
        mp = next((b for b in builds if 'Multiplayer' in b['title']), None)
        if not mp or not mp['att']:
            continue
        style = next((x for x in STYLES if x in mp['title']), 'Meta')
        apex, att = False, []
        for slot, nm in mp['att']:
            if slot.lower() == 'apex':
                apex = True; continue
            canon = names.get((wid, slot, nm.lower()))
            if not canon:
                # tolerate slot remaps (PPSh ammo -> Fire Mods, Cronen comb -> Stock)
                canon = next((it['n'] for it in A.get(wid, []) if it['n'].lower() == nm.lower()), None)
                slot = next((it['s'] for it in A.get(wid, []) if it['n'].lower() == nm.lower()), slot)
            if not canon:
                print('MISSING', wid, slot, nm); continue
            att.append([slot, canon])
        c = CAT[w['cat']]
        name = f"{w['name']} {style}"
        o = {'v': 1, 'n': name[:40], 'o': 'Min-Hee', 'p': [wid, 1 if apex else 0, att], 's': [c['s'], 0, []],
             'e': [c['lethal'], c['tactical'], c['fu']], 'k': c['perks'], 'z': c['ks']}
        meta.append({'name': name, 'note': note_for(w) + (' Uses the Apex attachment, so it needs max weapon level.' if apex else ''),
                     'role': ROLE[w['cat']] if style.lower() == ROLE[w['cat']].lower() else f"{ROLE[w['cat']]} · {style}", 'tier': t['t'], 'w': wid, 'apex': apex,
                     'att': [{'s': s_, 'n': n_} for s_, n_ in att], 'src': f"https://codmunity.gg/weapon/mw4/{REV.get(wid, wid)}", 'code': code(o)})
save('meta.json', meta)
print('tiers', [(t['t'], len(t['ids'])) for t in tiers['tiers']], 'builds', len(meta))

# ---- DMZ builds (each top gun's #1 DMZ build) ----
dmz_builds = []
for wid in ['m4', 'kastov-762', 'han-86', 'iso-nightshade', 'vel-46', 'ppsh-41', 'kg7-vulcan', 'mosin-nagant']:
    b = next((b for b in BL.get(wid, []) if 'DMZ' in b['title']), None)
    if not b: continue
    style = next((x for x in STYLES if x in b['title']), '')
    dmz_builds.append({'w': wid, 'style': style, 'att': [{'s': s, 'n': n} for s, n in b['att']]})
json.dump(dmz_builds, open(os.path.join(os.path.dirname(STATS), 'dmz-builds.json'), 'w'), indent=1)
print('dmz builds', len(dmz_builds))
