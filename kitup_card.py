#!/usr/bin/env python3
"""Render a Kit Up loadout card (PNG) and its floating video (MP4) with the app's own card code.

Usage:
  python3 kitup_card.py --repo /path/to/kitup-main-checkout --fonts /path/to/node_modules/@fontsource \
      --spec spec.json --out outdir [--no-video]

spec.json:
  {"id": "cronen-osprey", "mode": "warzone" | "multiplayer", "att": [["Optic", "Locus PX3 Canted"], ...],
   "tag": "#1 LONG RANGE",        (warzone only: the line under WARZONE // LOADOUT)
   "mag": 60,                     (warzone only: rounds in the build's magazine)
   "apex": true,                  (optional: build uses the gun's Apex attachment)
   "about": "One or two short sentences.",   (optional; replaces the gun's blurb after "Why it's meta:")
   "foot": "@KITUP.GG · WARZONE META · NOV 14"}   (optional footer, 40 characters at most)

Fonts: npm i @fontsource/big-shoulders-display @fontsource/barlow @fontsource/ibm-plex-mono
Needs: playwright (python), Google Chrome at /usr/bin/google-chrome, ffmpeg.
Warzone stats come from data/warzone-stats.json in the repo. Pick rates are never shown.
"""
import argparse, asyncio, base64, json, pathlib, subprocess, sys, time
from playwright.async_api import async_playwright

def font_css(fd):
    fd = pathlib.Path(fd)
    def face(fam, pkg, wt):
        b = base64.b64encode((fd / pkg / 'files' / f'{pkg}-latin-{wt}-normal.woff2').read_bytes()).decode()
        return f"@font-face{{font-family:'{fam}';font-weight:{wt};font-style:normal;src:url(data:font/woff2;base64,{b}) format('woff2');}}"
    return ''.join([face('Big Shoulders Display', 'big-shoulders-display', w) for w in (700, 800)]
                   + [face('Barlow', 'barlow', w) for w in (400, 500, 600, 700, 800)]
                   + [face('IBM Plex Mono', 'ibm-plex-mono', w) for w in (500, 700)])

def patched_html(repo, warzone):
    src = open(repo + '/index.html', encoding='utf-8').read()
    def rep(a, b):
        nonlocal src
        if src.count(a) != 1:
            sys.exit(f'PATCH MISS (the app card code changed; update kitup_card.py): {a[:70]!r} found {src.count(a)} times')
        src = src.replace(a, b)
    # long attachment names shrink to fit two lines instead of being cut off
    rep("x.fillStyle = C.ink; x.font = `800 ${bwid > 300 ? 27 : 25}px ${B}`;\n      const nm = wrapText(x, (a.n || 'Any').toUpperCase(), bwid - 104).slice(0, 2);",
        "x.fillStyle = C.ink; let fs = bwid > 300 ? 27 : 25, nm; do { x.font = `800 ${fs}px ${B}`; nm = wrapText(x, (a.n || 'Any').toUpperCase(), bwid - 104); fs--; } while (nm.length > 2 && fs > 16); nm = nm.slice(0, 2);")
    rep("window.KU = {", "window.__card = { makeGunCard, setAnim: v => { cardAnim = v; }, getAnim: () => cardAnim }; window.KU = {")
    if warzone:
        rep("x.fillText('MW4 // LOADOUT', W - M0 + 8, Y.logo - 34);", "x.fillText('WARZONE // LOADOUT', W - M0 + 8, Y.logo - 34);")
        rep("t && t !== '2nd' ? `${t} TIER` : (c.one || '').toUpperCase()", "window.__wz.tag")
        rep("['TTK 0–15 M', 'TTK 0-15M', v => 1 - (v - 100) / 700]", "['TTK 0–15 M', 'TTK 10M', v => 1 - (v - 300) / 700]")
        rep("['TTK 15–40 M', 'TTK 40M', v => 1 - (v - 100) / 700]", "['TTK 15–40 M', 'TTK 40M', v => 1 - (v - 300) / 700]")
        rep("function cardStats(slot) {", "function cardStats(slot) { if (window.__wz) return window.__wzStats(slot);")
    return src

SETUP = r"""
(cfg) => {
  window.__wzStats = function () {
    const z = window.__wz.s, ms = v => [String(Math.round(v)), 'MS'], r = (k, v, f) => [k, v == null ? null : { v }, f];
    return [r('TTK 0–15 M', z.ttk10, ms), r('TTK 15–40 M', z.ttk40, ms), r('ADS SPEED', z.ads, ms), r('SPRINT TO FIRE', z.stf, ms),
      r('VELOCITY', z.vel, v => [String(Math.round(v)), 'M/S']), r('RELOAD', z.reload, v => [(v / 1000).toFixed(2), 'S']),
      r('MAGAZINE', window.__wz.mag, v => [String(v), 'RDS']), r('FIRE RATE', z.rpm, v => [String(Math.round(v)), 'RPM'])].filter(x => x[1]);
  };
  if (cfg.foot) S.cardText = cfg.foot;
  S.cardTheme = 'uv';
  const w = S.W[cfg.id]; delete w.pick;
  if (cfg.about) w.about = cfg.about;
  if (cfg.mode === 'warzone') { window.__wz = { tag: cfg.tag || '', s: cfg.s, mag: cfg.mag || cfg.s.mag }; w.reserve = 0; w.metaStatus = w.metaStatus || 'Meta'; }
}
"""
FRAME = r"""
async ([cfg, fmt, t]) => {
  if (t == null) window.__card.setAnim(null); else { if (!window.__card.getAnim()) window.__card.setAnim({ t: 0 }); window.__card.getAnim().t = t; }
  const cv = await window.__card.makeGunCard({ w: cfg.id, att: cfg.att.map(a => ({ s: a[0], n: a[1] })), apex: !!cfg.apex }, fmt);
  return cv.toDataURL('image/png');
}
"""

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True); ap.add_argument('--fonts', required=True)
    ap.add_argument('--spec', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--no-video', action='store_true'); ap.add_argument('--port', type=int, default=8765)
    a = ap.parse_args()
    cfg = json.load(open(a.spec)); wz = cfg.get('mode') == 'warzone'
    if cfg.get('foot') and len(cfg['foot']) > 40: sys.exit('foot is longer than 40 characters')
    if wz:
        stats = json.load(open(a.repo + '/data/warzone-stats.json'))['guns']
        if cfg['id'] not in stats: sys.exit(f"no Warzone stats for {cfg['id']} in data/warzone-stats.json")
        cfg['s'] = stats[cfg['id']]
    known = json.load(open(a.repo + '/data/attachments.json')).get(cfg['id'])
    if known is not None:
        names = {x['n'].replace('"', '').lower() for x in known}
        bad = [n for _, n in cfg['att'] if n.replace(' ', ' ').replace('"', '').lower() not in names]
        if bad: print('WARNING: attachment names not in Kit Up data for this gun:', bad)
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    base = f"{cfg['id']}-{cfg.get('mode', 'multiplayer')}"
    html = patched_html(a.repo, wz); css = font_css(a.fonts)
    srv = subprocess.Popen([sys.executable, '-I', '-m', 'http.server', str(a.port), '--directory', a.repo, '--bind', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
            pg = await b.new_page()
            async def rt(r):
                u = r.request.url
                if '127.0.0.1' not in u: await r.abort()
                elif u.endswith('/index.html'): await r.fulfill(body=html, content_type='text/html; charset=utf-8')
                else: await r.continue_()
            await pg.route('**/*', rt)
            await pg.goto(f'http://127.0.0.1:{a.port}/index.html')
            await pg.add_style_tag(content=css)
            await pg.wait_for_function("id => typeof S !== 'undefined' && S.W && S.W[id]", arg=cfg['id'], timeout=30000)
            await pg.evaluate("Promise.all(['800 120px \"Big Shoulders Display\"','700 40px Barlow','800 40px Barlow','500 30px Barlow','500 30px \"IBM Plex Mono\"'].map(f=>document.fonts.load(f)))")
            await pg.evaluate(SETUP, cfg)
            url = await pg.evaluate(FRAME, [cfg, 'post', None])
            (out / f'{base}.png').write_bytes(base64.b64decode(url.split(',')[1]))
            if not a.no_video:
                fr = out / f'{base}-frames'; fr.mkdir(exist_ok=True)
                for i in range(180):
                    url = await pg.evaluate(FRAME, [cfg, 'story', i / 30])
                    (fr / f'f{i:03d}.png').write_bytes(base64.b64decode(url.split(',')[1]))
            await b.close()
    finally:
        srv.terminate()
    if not a.no_video:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(fr / 'f%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', str(out / f'{base}-floating.mp4')], check=True)
        for f in fr.iterdir(): f.unlink()
        fr.rmdir()
    print('done', [str(x) for x in sorted(out.glob(base + '*'))])

asyncio.run(main())
