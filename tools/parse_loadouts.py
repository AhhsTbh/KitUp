"""Parse per-gun loadouts for Warzone, Resurgence, DMZ and Multiplayer from crawled pages.
Usage: python3 -I tools/parse_loadouts.py PAGES_DIR data/game.json data/attachments.json data/loadouts.json
Every attachment is checked against data/attachments.json (gun, slot, name). An attachment missing from that table is kept but flagged
in 'unverified' (real per the source, stats unavailable here). Illegal slots, duplicates or >5 attachments are left out. Multiplayer here is only a gap-filler; data/meta.json stays primary."""
import datetime, html, json, os, re, sys
src, game_json, att_json, out = sys.argv[1:5]
W = {w['id']: w for w in json.load(open(game_json))['weapons']}
A = json.load(open(att_json))
SLUG = {'x-58-nyx': 'x58-nyx', 'kg-7-vulcan': 'kg7-vulcan', 'pm-40-anvil': 'pm40-anvil', 'fss-carbon-edge-1095': 'fss-carbon-edge'}
MODE = {'Warzone': 'warzone', 'Warzone Resurgence': 'resurgence', 'MW4 DMZ': 'dmz', 'MW4 Multiplayer': 'multiplayer'}
txt = lambda s: html.unescape(re.sub(r'\s+', ' ', re.sub(r'<!--.*?-->|<[^>]+>', ' ', s))).strip()
res = {m: {} for m in MODE.values()}; skipped = []; seen = 0
for fn in sorted(os.listdir(src)):
    wid = SLUG.get(fn[:-5], fn[:-5])
    if wid not in W: continue
    h = open(os.path.join(src, fn), encoding='utf-8', errors='replace').read()
    have = {(i['s'], i['n']) for i in A.get(wid, [])}
    for m in re.finditer(r'<article class="wx-card', h):
        end = h.find('<article class="wx-card', m.start() + 10)
        card = h[m.start(): end if end > 0 else m.start() + 30000]
        t = re.search(r'class="wx-title"[^>]*>(.*?)</h3>', card, flags=re.S)
        t = txt(t.group(1)) if t else ''
        mm = re.match(r'Best .*? (?:Loadout)?\s*\((Warzone Resurgence|Warzone|MW4 DMZ|MW4 Multiplayer)\)\s*$', t)
        if not mm: continue
        mode = MODE[mm.group(1)]; seen += 1
        name = re.sub(r'^Best .*? ((?:[A-Z][A-Za-z0-9\-/ ]+?)) Loadout.*$', r'\1', t)
        name = re.sub(r'^Best\s+', '', t); name = re.sub(r'\s*Loadout\s*\(.*$', '', name)
        gun = W[wid]['name']
        name = name[len(gun):].strip() if name.lower().startswith(gun.lower()) else name
        s = re.search(r'class="wx-src"[^>]*>(.*?)</p>', card, flags=re.S); s = txt(s.group(1)) if s else ''
        d = re.search(r'Last Updated:\s*(\d\d)/(\d\d)/(\d{4})', s)
        upd = f'{d.group(3)}-{d.group(2)}-{d.group(1)}' if d else None
        rk = re.search(r'#\s*(\d+)', txt(re.search(r'class="wx-badge-rank".*?</div>', card, flags=re.S).group(0))) if 'wx-badge-rank' in card else None
        atts = []
        a = card.find('wx-attachments')
        if a >= 0:
            for li in re.findall(r'<li>(.*?)</li>', card[a: card.find('</ul>', a)], flags=re.S):
                sm = re.search(r'<small>(.*?)</small>', li, flags=re.S); st = re.search(r'<strong>(.*?)</strong>', li, flags=re.S)
                if sm and st: atts.append({'s': txt(sm.group(1)).split('·')[0].strip(), 'n': txt(st.group(1))})
        tk = re.search(r'Avg TTK\s*([\d–\-]+ ?m)\s*(\d+)\s*ms', txt(card))
        if not atts: continue  # 'Additional Loadouts' cards carry no slot info; only the top loadouts are used
        seen_real = True
        bad = [x for x in atts if x['s'] != 'Apex' and (x['s'], x['n']) not in have]
        slots = [x['s'] for x in atts]
        if not atts or len(atts) > 5 or len(set(slots)) != len(slots) or any(x['s'] not in W[wid].get('slots', []) + ['Apex'] for x in atts):
            skipped.append((mode, wid, name, [x['n'] for x in bad] or 'illegal/empty')); continue
        res[mode].setdefault(wid, []).append({'n': name, 'top': bool(upd), 'rank': int(rk.group(1)) if rk else None, 'updated': upd,
                                              'att': atts, **({'unverified': [x['n'] for x in bad]} if bad else {}), **({'ttk': int(tk.group(2)), 'ttkRange': tk.group(1).replace(' ', '')} if tk else {})})
json.dump({'generated': datetime.date.today().isoformat(), 'note': 'Loadouts per mode. Warzone TTK is the loadout average at close range in that mode. Multiplayer here only fills gaps; data/meta.json is primary.', 'modes': res}, open(out, 'w'), indent=1, ensure_ascii=False)
print(f'{seen} loadouts read, {sum(len(v) for m in res.values() for v in m.values())} kept, {len(skipped)} left out (illegal slots or too many attachments)')
for m, g in res.items(): print(m, 'guns', len(g), 'loadouts', sum(len(v) for v in g.values()))
for x in skipped[:12]: print('left out', x)
