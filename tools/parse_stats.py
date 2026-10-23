import re, sys, os, html, json

src, game_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
g = json.load(open(game_json))
W = {w['id']: w for w in g['weapons']}
NAME = {w['name'].lower().replace('-', ' '): w['id'] for w in g['weapons']}
SLUG = {'x-58-nyx': 'x58-nyx', 'kg-7-vulcan': 'kg7-vulcan', 'pm-40-anvil': 'pm40-anvil', 'fss-carbon-edge-1095': 'fss-carbon-edge'}
txt = lambda s: html.unescape(re.sub(r'\s+', ' ', re.sub(r'<!--.*?-->|<[^>]+>', '', s))).strip()
KEYS = {
    'Fire Rate': 'rpm', 'TTK (0-15m)': 'ttk15', 'TTK (15-40m)': 'ttk40', 'TTK (40-80m)': 'ttk80', 'TTK (80-100m)': 'ttk100',
    'ADS Speed': 'ads', 'Sprint To Fire': 'stf', 'Reload Speed': 'reload', 'Bullet Velocity': 'vel', 'Movement': 'move',
    'ADS Movement': 'adsMove', 'Sprint': 'sprint', 'Tactical Sprint Speed': 'tac', 'Horizontal Recoil': 'hRecoil',
    'Vertical Recoil': 'vRecoil', 'Gun Kick': 'kick', 'Bullet Penetration': 'pen', 'Hitscan Range': 'hitscan',
    'Magazine Size': 'mag', 'ADS Idle Sway': 'sway', 'Raise Speed': 'raise', 'Drop Speed': 'drop', 'Pre-Fire Delay': 'prefire',
}
stats, meta, picks, report = {}, {}, {}, []
for fn in sorted(os.listdir(src)):
    slug = fn[:-5]; wid = SLUG.get(slug, slug)
    if wid not in W:
        continue
    h = open(os.path.join(src, fn), encoding='utf-8', errors='replace').read()
    i = h.find('wd-stat-grid')
    s = {}
    if i >= 0:
        grid = h[i:h.find('</div></div>', h.find('Open in Stats', i) - 200 if h.find('Open in Stats', i) > 0 else i + 20000)]
        grid = h[i:h.find('Open in Stats', i)]
        for lab, val in re.findall(r'<div class="wd-stat"><span>(.*?)</span><strong>(.*?)</strong>', grid, flags=re.S):
            lab = txt(lab); v = txt(val)
            m = re.match(r'(-?[\d,.]+)', v)
            if lab in KEYS and m:
                n = float(m.group(1).replace(',', ''))
                s[KEYS[lab]] = int(n) if n.is_integer() else n
    stats[wid] = s
    m = re.search(r'currently ranks #(\d+) for ([A-Za-z ]+?) in MW4 Multiplayer and sits in the ([A-Za-z ]+?) tier', txt(h))
    if m:
        meta[wid] = {'rank': int(m.group(1)), 'style': m.group(2), 'status': m.group(3)}
    # pick-rate table (peers)
    for t in [k.start() for k in re.finditer('class="wd-table"', h)]:
        seg = h[t:h.find('</table>', t)]
        if 'Pick Rate' not in seg:
            continue
        for r in re.findall(r'<tr[^>]*>(.*?)</tr>', seg, flags=re.S):
            tds = [txt(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', r, flags=re.S)]
            if len(tds) >= 4 and tds[3].endswith('%'):
                nm = tds[0].replace('→', '').strip().lower().replace('-', ' ')
                wid2 = NAME.get(nm)
                if wid2:
                    picks[wid2] = {'pick': float(tds[3][:-1]), 'status': tds[2]}
    report.append(f"{wid}: {len(s)} stats ttk={s.get('ttk15')}/{s.get('ttk40')} ads={s.get('ads')} meta={meta.get(wid)}")
json.dump({'stats': stats, 'meta': meta, 'picks': picks}, open(out, 'w'), indent=1)
print('\n'.join(report))
print('picks', len(picks), sorted(picks.items(), key=lambda kv: -kv[1]['pick'])[:12])
