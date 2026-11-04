"""Generate one static, searchable page per gun (guns/<id>/index.html), plus guns/index.html, sitemap.xml and robots.txt.
Run from the repo root after data/game.json changes:  python tools/build_seo.py"""
import json, html, os, datetime
SITE = "https://kitup.gg"
INVITE = "https://discord.gg/2qPdNCwaHn"
CATS = {"ar": "Assault Rifle", "smg": "SMG", "lmg": "LMG", "sniper": "Sniper Rifle", "marksman": "Marksman Rifle", "shotgun": "Shotgun", "pistol": "Pistol", "br": "Battle Rifle"}
e = html.escape
CSS = """:root{color-scheme:dark;--bg:#0b0714;--p:#14102a;--l:#2a2150;--u:#9B7BFF;--m:#8f86b3;--t:#ece6ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
main{max-width:760px;margin:auto;padding:16px}a{color:#C9B8FF}h1{margin:.2em 0;font-size:28px}h2{font-size:18px;color:#C9B8FF;margin:0 0 8px}
.c{background:var(--p);border:1px solid var(--l);border-radius:14px;padding:14px;margin:12px 0}.m{color:var(--m);font-size:14px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 4px;border-bottom:1px solid var(--l);text-align:left}
.b{display:block;text-decoration:none;background:linear-gradient(135deg,rgba(155,123,255,.3),rgba(155,123,255,.06));border:1px solid var(--l);border-radius:14px;padding:12px 14px;margin:12px 0;color:var(--t)}.b b{display:block;color:#C9B8FF}
img{max-width:100%;height:auto;display:block;margin:8px auto}ul{padding-left:18px}li{margin:4px 0}"""
def page(title, desc, path, body):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{SITE}{path}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:type" content="website"><meta property="og:url" content="{SITE}{path}">
<link rel="icon" type="image/webp" href="/icons/logo-96.webp"><style>{CSS}</style></head><body><main>{body}</main></body></html>"""
BANNER = f'<a class="b" href="{INVITE}" target="_blank" rel="noopener"><b>Find your squad</b>Xbox, PC and PlayStation players in one Discord. Join KitUp N Lounge →</a>'
g = json.load(open("data/game.json")); ws = [w for w in g["weapons"] if w.get("live") and w["live"].get("ttk15")]
ws.sort(key=lambda w: w["name"]); today = datetime.date.today().isoformat(); urls = ["/", "/guns/"]
for w in ws:
    L = w["live"]; cat = CATS.get(w.get("cat"), (w.get("cat") or "weapon").upper()); path = f"/guns/{w['id']}/"; urls.append(path)
    stk = lambda t: round(t * L["rpm"] / 60000) + 1
    desc = f"{w['name']} ({cat}) in Modern Warfare 4: {L['ttk15']} ms time-to-kill at 15m, {L['ttk100']} ms at 100m, {L['rpm']} RPM, {L['ads']} ms ADS. Measured stats and recoil on Kit Up."
    peers = [p for p in ws if p.get("cat") == w.get("cat") and p["id"] != w["id"]][:6]
    rows = "".join(f"<tr><td>{r} m</td><td>{L['ttk'+str(r)]} ms</td><td>{stk(L['ttk'+str(r)])}</td></tr>" for r in (15, 40, 80, 100))
    body = f"""<p class="m"><a href="/">Kit Up</a> › <a href="/guns/">Guns</a> › {e(w['name'])}</p><h1>{e(w['name'])}: TTK, recoil and stats</h1><p class="m">{e(cat)} · Modern Warfare 4</p>
<img src="/{e(w['photo'])}" alt="{e(w['name'])} in Modern Warfare 4" width="480" loading="lazy">
<p>{e(w.get('about',''))}</p>{BANNER}
<div class="c"><h2>Time-to-kill by range</h2><table><tr><th>Range</th><th>TTK</th><th>Shots to kill</th></tr>{rows}</table><p class="m">Measured values. Shots to kill are derived from TTK and fire rate.</p></div>
<div class="c"><h2>Handling and recoil</h2><table><tr><td>Fire rate</td><td>{L['rpm']} RPM</td></tr><tr><td>ADS time</td><td>{L['ads']} ms</td></tr><tr><td>Horizontal recoil</td><td>{L['hRecoil']}</td></tr><tr><td>Vertical recoil</td><td>{L['vRecoil']}</td></tr><tr><td>Magazine / reserve</td><td>{w.get('mag','')} / {w.get('reserve','')}</td></tr></table></div>
<div class="c"><h2>Other {e(cat)}s</h2><ul>{''.join(f'<li><a href="/guns/{p["id"]}/">{e(p["name"])}</a></li>' for p in peers)}</ul></div>
<a class="b" href="/"><b>Open the Kit Up app</b>Loadouts, attachments, camos and the TTK Lab →</a><p class="m">Updated {today}</p>"""
    os.makedirs(f"guns/{w['id']}", exist_ok=True); open(f"guns/{w['id']}/index.html", "w").write(page(f"{w['name']} TTK, Recoil and Stats | Kit Up", desc, path, body))
idx = "<h1>Modern Warfare 4 guns: TTK and stats</h1>" + BANNER + "".join(f'<div class="c"><h2>{e(c)}</h2><ul>' + "".join(f'<li><a href="/guns/{w["id"]}/">{e(w["name"])}</a> <span class="m">{w["live"]["ttk15"]} ms at 15m</span></li>' for w in ws if CATS.get(w.get("cat"), (w.get("cat") or "").upper()) == c) + "</ul></div>" for c in sorted({CATS.get(w.get("cat"), (w.get("cat") or "").upper()) for w in ws}))
open("guns/index.html", "w").write(page("MW4 Guns: TTK, Recoil and Stats | Kit Up", "Every Modern Warfare 4 gun with measured time-to-kill, fire rate and recoil.", "/guns/", idx))
open("sitemap.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{SITE}{u}</loc><lastmod>{today}</lastmod></url>" for u in urls) + "</urlset>")
open("robots.txt", "w").write(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
print(len(ws), "gun pages")
