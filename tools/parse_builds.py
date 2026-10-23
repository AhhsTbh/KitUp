import re, sys, os, html, json

src, game_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
g = json.load(open(game_json))
W = {w['id']: w for w in g['weapons']}
SLUG = {'x-58-nyx': 'x58-nyx', 'kg-7-vulcan': 'kg7-vulcan', 'pm-40-anvil': 'pm40-anvil', 'fss-carbon-edge-1095': 'fss-carbon-edge'}
txt = lambda s: html.unescape(re.sub(r'\s+', ' ', re.sub(r'<!--.*?-->|<[^>]+>', ' ', s))).strip()
res = {}
for fn in sorted(os.listdir(src)):
    slug = fn[:-5]; wid = SLUG.get(slug, slug)
    if wid not in W:
        continue
    h = open(os.path.join(src, fn), encoding='utf-8', errors='replace').read()
    builds = []
    for m in re.finditer(r'<article class="wx-card', h):
        end = h.find('<article class="wx-card', m.start() + 10)
        card = h[m.start(): end if end > 0 else m.start() + 30000]
        title = re.search(r'class="wx-title"[^>]*>(.*?)</h3>', card, flags=re.S)
        ttl = txt(title.group(1)) if title else ''
        src_ = re.search(r'class="wx-src"[^>]*>(.*?)</p>', card, flags=re.S)
        atts = []
        a = card.find('wx-attachments')
        if a >= 0:
            ul = card[a: card.find('</ul>', a)]
            for li in re.findall(r'<li>(.*?)</li>', ul, flags=re.S):
                sm = re.search(r'<small>(.*?)</small>', li, flags=re.S)
                st = re.search(r'<strong>(.*?)</strong>', li, flags=re.S)
                if sm and st:
                    slot = txt(sm.group(1)).split('·')[0].strip()
                    atts.append([slot, txt(st.group(1))])
        builds.append({'title': ttl, 'src': txt(src_.group(1)) if src_ else '', 'att': atts})
    res[wid] = builds
json.dump(res, open(out, 'w'), indent=1, ensure_ascii=False)
for k, v in res.items():
    print(k, [(b['title'][:50], b['src'][:30], len(b['att'])) for b in v][:3])
