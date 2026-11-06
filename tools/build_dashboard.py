"""Internal Trust and Accuracy dashboard. Run from the repo root:  python3 -I tools/build_dashboard.py
Writes tools/trust_dashboard.html (not published: /tools/* is blocked on the site; open the file locally or keep it as a CI artifact).
Runs the data validator and the automated tests so the page shows their real current results."""
import html, json, os, re, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
subprocess.run([sys.executable, '-I', 'tools/build_trust.py'], capture_output=True)
rep = json.load(open('tools/trust_report.json'))
val = subprocess.run([sys.executable, '-I', 'tools/validate_data.py'], capture_output=True, text=True).stdout.splitlines()
tests = subprocess.run(['npm', 'test'], capture_output=True, text=True).stdout
tp, tf = (re.search(rf'# {k} (\d+)', tests) for k in ('pass', 'fail'))
errs = [l[6:] for l in val if l.startswith('ERROR')]; warns = [l[6:] for l in val if l.startswith('warn')]
pick = lambda words: [w for w in warns + errs if any(x in w.lower() for x in words)]
W = rep['weapons']; E = html.escape
rows = ''.join(f"<tr><td>{E(i)}</td><td>{r['completeness']}%</td><td>{E(r['confidence'])}</td><td>{'yes' if r['patchAffected'] else ''}</td><td>{E(', '.join(r['missing']))}</td></tr>" for i, r in sorted(W.items()))
sec = lambda t, items: f"<h2>{t} ({len(items)})</h2>" + ('<ul>' + ''.join(f'<li>{E(x)}</li>' for x in items) + '</ul>' if items else '<p class="ok">None</p>')
comp = ''.join(f"<li>{k}: {v['value']} (weight {v['weight']})</li>" for k, v in rep['components'].items())
open('tools/trust_dashboard.html', 'w').write(f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Kit Up trust dashboard</title>
<style>body{{font:15px/1.5 system-ui;background:#0c0a14;color:#e8e4f5;max-width:900px;margin:0 auto;padding:20px}}h1,h2{{margin:.8em 0 .3em}}table{{width:100%;border-collapse:collapse}}td,th{{border-bottom:1px solid #2a2150;padding:6px;text-align:left}}.big{{font-size:3rem;font-weight:800;color:#9B7BFF}}.ok{{color:#3DDC97}}li{{margin:2px 0}}</style>
<h1>Kit Up trust dashboard</h1><p>Generated {E(rep['generated'])}. Internal only.</p>
<div class=big>{rep['score']}/100</div><p>Data Trust Score, calculated by tools/build_trust.py. Agreement between independent sources: {E(rep['agreement']['status'])}.</p><ul>{comp}</ul>
<h2>Summary</h2><ul><li>Weapons with stats: {rep['weaponsScored']}</li><li>Live stats measured: {E(rep['liveStatsMeasured'])} ({rep['liveStatsAgeDays']} days ago)</li><li>Changed by a newer patch: {len(rep['patchAffected'])}</li>
<li>Last successful sync: loadouts and stats are refreshed by hand; there is no scheduled sync yet</li><li>Failed source checks: not tracked yet</li><li>Automated tests: {tp.group(1) if tp else '?'} passed, {tf.group(1) if tf else '?'} failed</li></ul>
{sec('Validator errors (invalid attachments, broken asset paths, bad data)', errs)}{sec('Missing images and assets', pick(['image', 'no image']))}{sec('Conflicting or odd statistics', pick(['differ', 'faster with distance', 'odd stat', 'above the gun max']))}{sec('Patch processing', pick(['patch']))}
<h2>Per-weapon</h2><table><tr><th>Gun</th><th>Complete</th><th>Confidence</th><th>Patch-affected</th><th>Missing</th></tr>{rows}</table>""")
print(f"dashboard written: score {rep['score']}, {len(errs)} errors, {len(warns)} warnings, tests {tp.group(1) if tp else '?'}/{tf.group(1) if tf else '?'}")
