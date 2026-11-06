/* Kit Up Lab+: build-vs-build kill time and recoil comparison, added to the Lab page.
   Everything here is worked out in the browser from numbers already in data/game.json (live stats) and
   data/attachments.json (listed stat changes). Where something is an estimate or an illustration, the page says so. */
(function () {
'use strict';
if (typeof window === 'undefined' || !window.renderLab) return;
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const R = [15, 40, 80, 100], COL = ['#9B7BFF', '#F2B726'];
const LP = { a: { w: 'han-86', o: 1 }, b: { w: 'm4', o: 1 }, acc: 65 };
const ws = () => S.g.weapons.filter(w => w.live && w.live.ttk15 != null);
const gun = id => S.W[id];

function options(id) {
  const w = gun(id), o = [{ label: 'No attachments', att: [] }];
  (S.meta || []).filter(m => m.w === id && !m.side).forEach(m => o.push({ label: m.name, att: m.att }));
  if (S.L && S.L.p && S.L.p.w === id && S.L.p.att.length) o.push({ label: 'Your loadout', att: S.L.p.att });
  return o;
}
function pick(side) {
  const s = LP[side], w = gun(s.w) || ws()[0], o = options(w.id);
  return { w, o, sel: o[Math.min(s.o, o.length - 1)] };
}
/** Stats for one gun + attachments. Attachment changes come from their listed % values. */
function stats(w, att) {
  const B = att && att.length ? U.buildStats({ w: w.id, att }) : null;
  const get = k => { const r = B && B.rows.find(r => r.k === k); return r ? r.val : w.live[k]; };
  const rpm = get('rpm') || w.live.rpm;
  return { rpm, ads: get('ads'), stf: get('stf'), v: get('vRecoil'), h: get('hRecoil'), kick: get('kick'), vel: get('vel'), tac: get('tac'), reload: get('reload'), mag: get('mag'),
    ttk: R.map(r => w.live['ttk' + r] * w.live.rpm / rpm), count: B ? B.n : 0 };
}
const at = (t, r) => { if (r <= 15) return t[0]; for (let i = 1; i < 4; i++) if (r <= R[i]) return t[i - 1] + (t[i] - t[i - 1]) * (r - R[i - 1]) / (R[i] - R[i - 1]); return t[3]; };
const practical = (ms, rpm, acc) => window.GunsmithEngine ? window.GunsmithEngine.practicalTTK(ms, rpm, acc) : null;
const shots = (ms, rpm) => window.GunsmithEngine ? window.GunsmithEngine.shotsToKill(ms, rpm) : null;

function ttkChart(sets) {
  const W = 340, H = 210, p = 34, mx = Math.max(...sets.flatMap(s => s.st.ttk)) * 1.1;
  const X = r => p + r / 100 * (W - p - 8), Y = t => H - 22 - t / mx * (H - 34);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Kill time by distance for both builds" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:12px">`;
  for (let r = 0; r <= 100; r += 20) s += `<line x1="${X(r)}" x2="${X(r)}" y1="8" y2="${H - 22}" stroke="var(--line)"/><text x="${X(r) - 8}" y="${H - 8}" font-size="9" fill="var(--muted)">${r}m</text>`;
  for (let i = 0; i < 5; i++) { const t = mx * i / 4; s += `<line x1="${p}" x2="${W - 8}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="2" y="${Y(t) + 3}" font-size="9" fill="var(--muted)">${Math.round(t)}</text>`; }
  sets.forEach((x, i) => {
    let d = ''; for (let r = 0; r <= 100; r += 2) d += (r ? 'L' : 'M') + X(r).toFixed(1) + ' ' + Y(at(x.st.ttk, r)).toFixed(1);
    s += `<path d="${d}" fill="none" stroke="${COL[i]}" stroke-width="2.4" ${i ? 'stroke-dasharray="6 3"' : ''}/>`;
    x.st.ttk.forEach((v, j) => { s += `<circle cx="${X(R[j])}" cy="${Y(v)}" r="3" fill="${COL[i]}"/>`; });
  });
  return s + '</svg>';
}

/** Recoil picture: the climb and the sideways wander are scaled from the measured vertical and horizontal recoil numbers.
    The scale is the same for both builds, so the size difference is real. The wiggle shape is an illustration, not the in-game pattern. */
function recoilChart(sets) {
  const W = 340, H = 240, cx = W / 2, base = H - 18, N = 24;
  const mv = Math.max(...sets.map(x => x.st.v || 0), 1), mh = Math.max(...sets.map(x => x.st.h || 0), 1);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Illustrative recoil climb for both builds" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:12px"><line x1="${cx}" x2="${cx}" y1="8" y2="${base}" stroke="var(--line)"/>`;
  sets.forEach((x, i) => {
    const v = x.st.v || 0, h = x.st.h || 0; let d = `M${cx} ${base}`;
    for (let n = 1; n <= N; n++) {
      const y = base - (v / mv) * (H - 40) * Math.pow(n / N, .9);
      const xx = cx + Math.sin(n * .5 + i * 1.7) * (h / mh) * (W / 2 - 30) * Math.min(n, 8) / 8 * .6;
      d += `L${xx.toFixed(1)} ${y.toFixed(1)}`;
    }
    s += `<path d="${d}" fill="none" stroke="${COL[i]}" stroke-width="2.2" ${i ? 'stroke-dasharray="6 3"' : ''}/>`;
  });
  return s + '</svg>';
}

function row(label, a, b, lowGood, fmt) {
  if (a == null && b == null) return '';
  const f = v => v == null ? '–' : fmt(v), aw = a != null && b != null && (lowGood ? a < b : a > b), bw = a != null && b != null && (lowGood ? b < a : b > a);
  return `<tr><td>${label}</td><td class="${aw ? 'lp-w' : ''}">${f(a)}</td><td class="${bw ? 'lp-w' : ''}">${f(b)}</td></tr>`;
}
const ms = v => Math.round(v) + ' ms', n1 = v => v.toFixed(1), n2 = v => v.toFixed(2);

function side(k) {
  const x = pick(k), idx = LP[k].o > x.o.length - 1 ? 0 : LP[k].o;
  return `<div class="lp-side"><select data-lp="${k}w" class="lab-i" aria-label="Gun ${k.toUpperCase()}">${ws().map(w => `<option value="${w.id}"${w.id === x.w.id ? ' selected' : ''}>${U.esc(w.name)}</option>`).join('')}</select>
    <select data-lp="${k}o" class="lab-i" aria-label="Build for gun ${k.toUpperCase()}">${x.o.map((o, i) => `<option value="${i}"${i === idx ? ' selected' : ''}>${U.esc(o.label)}</option>`).join('')}</select></div>`;
}

function block() {
  const A = pick('a'), B = pick('b');
  const sets = [{ x: A, st: stats(A.w, A.sel.att) }, { x: B, st: stats(B.w, B.sel.att) }];
  const [a, b] = [sets[0].st, sets[1].st], acc = LP.acc / 100;
  const names = sets.map(s => s.x.sel.label.toLowerCase().startsWith(s.x.w.name.toLowerCase()) ? s.x.sel.label : `${s.x.w.name} · ${s.x.sel.label}`);
  const tt = (st, i) => Math.round(st.ttk[i]);
  const pr = (st, i) => practical(st.ttk[i], st.rpm, acc);
  return `<div class="lab-c lp"><h3>Build vs build</h3>
    <p class="lab-s">Pick two guns and a build for each: no attachments, a live meta build, or your own loadout. Attachment changes come from their listed stat changes.</p>
    <div class="lp-sides">${side('a')}${side('b')}</div>
    <div class="lp-key"><span style="color:${COL[0]}">━ ${U.esc(names[0])}</span><span style="color:${COL[1]}">┅ ${U.esc(names[1])}</span></div>
    ${ttkChart(sets)}
    <table class="lab-t lp-t"><thead><tr><th></th><th style="color:${COL[0]}">A</th><th style="color:${COL[1]}">B</th></tr></thead><tbody>
      ${R.map((r, i) => row(`Theoretical TTK ${r}m`, tt(a, i), tt(b, i), true, ms)).join('')}
      ${row('Shots to kill up close', shots(a.ttk[0], a.rpm), shots(b.ttk[0], b.rpm), true, v => v)}
      ${row(`Practical TTK 15m · ${LP.acc}% hits`, pr(a, 0), pr(b, 0), true, ms)}
      ${row(`Practical TTK 40m · ${LP.acc}% hits`, pr(a, 1), pr(b, 1), true, ms)}
      ${row('Fire rate', a.rpm, b.rpm, false, v => Math.round(v) + ' RPM')}
      ${row('ADS speed', a.ads, b.ads, true, ms)}
      ${row('Sprint to fire', a.stf, b.stf, true, ms)}
      ${row('Reload', a.reload, b.reload, true, v => (v / 1000).toFixed(2) + ' s')}
      ${row('Tactical sprint', a.tac, b.tac, false, v => v.toFixed(2) + ' m/s')}
      ${row('Bullet velocity', a.vel, b.vel, false, v => Math.round(v) + ' m/s')}
      ${row('Vertical recoil', a.v, b.v, true, n1)}${row('Horizontal recoil', a.h, b.h, true, n1)}${row('Gun kick', a.kick, b.kick, true, n1)}
    </tbody></table>
    <label class="lab-s">Hit rate for practical TTK <select data-lp="acc" class="lab-i" style="width:auto" aria-label="Hit rate">${[40, 50, 65, 80, 95].map(v => `<option value="${v}"${v === LP.acc ? ' selected' : ''}>${v}%</option>`).join('')}</select></label>
    <p class="lab-s"><b>Theoretical</b> means every shot lands. <b>Practical</b> is an estimate that counts only the share of shots you choose, not measured gameplay. Attachment fire rate changes are included. Attachment damage range changes and armor aren't, because there's no verified data for them here. Multiplayer, Modern Warfare 4, live data updated ${U.esc(U.fmtDay(S.g.meta.liveUpdated))}.</p>
  </div>
  <div class="lab-c lp"><h3>Recoil compare, builds</h3>
    ${recoilChart(sets)}
    <div class="lp-key"><span style="color:${COL[0]}">━ A</span><span style="color:${COL[1]}">┅ B</span></div>
    <p class="lab-s"><b>Calculated illustration.</b> The climb height and sideways wander are scaled from each build's measured vertical and horizontal recoil, on the same scale, so a bigger line really is more recoil. The wiggle is only an illustration. It is not the in-game pattern, and Kit Up doesn't have measured spray patterns. ${recoilTip(a, b, names)}</p>
  </div>`;
}
function recoilTip(a, b, names) {
  if (a.v == null || b.v == null) return '';
  const ta = a.v + a.h, tb = b.v + b.h; if (!ta || !tb) return '';
  const d = Math.round((1 - Math.min(ta, tb) / Math.max(ta, tb)) * 100);
  if (d < 3) return 'The two builds have about the same recoil.';
  return `${U.esc(ta < tb ? names[0] : names[1])} has about ${d}% less combined recoil.`;
}

const css = document.createElement('style');
css.textContent = `.lp-sides{display:grid;gap:8px;margin:8px 0}.lp-side{display:grid;grid-template-columns:1fr 1fr;gap:8px}.lp .lab-i{min-height:44px;font-size:16px;width:100%}.lp-key{display:flex;gap:14px;flex-wrap:wrap;font:700 .72rem/1.3 var(--f-body,inherit);margin:6px 0}.lp-t td,.lp-t th{text-align:right}.lp-t td:first-child,.lp-t th:first-child{text-align:left}.lp-w{color:var(--buff,#3DDC97);font-weight:800}`;
document.head.appendChild(css);

const base = window.renderLab;
window.renderLab = function () {
  let html = base();
  let extra = '';
  try { extra = block(); } catch (e) { extra = ''; }
  const mark = '<div class="lab-c"><h3>TTK vs range';
  return html.includes(mark) ? html.replace(mark, extra + mark) : html.replace(/<\/section>\s*$/, extra + '</section>');
};
const re = () => { const y = scrollY; go('lab'); scrollTo(0, y); };
document.addEventListener('change', e => {
  const k = e.target && e.target.dataset && e.target.dataset.lp; if (!k) return;
  if (k === 'acc') LP.acc = Number(e.target.value) || 65;
  else if (k === 'aw' || k === 'bw') { LP[k[0]] = { w: e.target.value, o: 1 }; }
  else if (k === 'ao' || k === 'bo') LP[k[0]].o = Number(e.target.value) || 0;
  re();
});
window.LabPlus = { stats, options };
})();
