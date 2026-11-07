/* Kit Up: best loadouts per mode (Warzone, DMZ, Resurgence). Data: data/loadouts.json. */
(function () {
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const M = { mode: 'warzone', cat: 'all', data: null, stats: null, loading: false };
const MODES = [['warzone', 'Warzone'], ['dmz', 'DMZ'], ['resurgence', 'Resurgence'], ['squad', 'Squad check']];
const Q = { size: 3, picks: ['', '', '', ''] };
const BANDS = [['close', 'Close range'], ['mid', 'Mid range'], ['long', 'Long range'], ['sniper', 'Sniper support']];
const CAT_BANDS = { smg: ['close'], sg: ['close'], ar: ['mid'], lmg: ['mid', 'long'], mr: ['long'], sr: ['long', 'sniper'] };
/* Strategic heuristic from weapon class and the loadout's name. Not a verified game mechanic. */
function bandsOf(id) {
  const w = S.W[id], b = ((((M.data || {}).modes || {}).warzone || {})[id] || [])[0], out = new Set(CAT_BANDS[w.cat] || []);
  if (b && /close/i.test(b.n)) out.add('close'); if (b && /long range/i.test(b.n)) out.add('long'); if (b && /sniper/i.test(b.n)) { out.add('long'); out.add('sniper'); }
  return out;
}
function squadHTML() {
  const wz = (M.data.modes || {}).warzone || {}, opts = S.g.weapons.filter(w => wz[w.id]).sort((a, b) => a.name.localeCompare(b.name));
  const picks = Q.picks.slice(0, Q.size), chosen = picks.filter(Boolean);
  const cov = Object.fromEntries(BANDS.map(([k]) => [k, []]));
  chosen.forEach((id, i) => bandsOf(id).forEach(k => cov[k].push(S.W[id].name)));
  const miss = BANDS.filter(([k]) => !cov[k].length);
  const sug = miss.map(([k, l]) => { const cands = opts.filter(w => bandsOf(w.id).has(k)).sort(byMeta); return cands[0] ? `${l}: ${cands[0].name} (${(wzm(cands[0].id) || {}).status || 'no meta status'})` : `${l}: no suggestion`; });
  return `<div class="card"><p class="small muted">Pick each teammate's main gun. The check looks at which fighting distances your squad covers, using each gun's class and its top Warzone loadout. It is a strategy guide, not a calculation from game mechanics.</p>
    <div class="chips" role="group" aria-label="Squad size">${[2, 3, 4].map(n => `<button class="chip" data-wz="size" data-v="${n}" aria-pressed="${Q.size === n}">${n} players</button>`).join('')}</div>
    ${picks.map((v, i) => `<label class="small muted">Player ${i + 1}<select class="lab-i wz-sel" data-wz="pick" data-i="${i}" aria-label="Player ${i + 1} main gun"><option value="">Choose a gun</option>${opts.map(w => `<option value="${U.esc(w.id)}"${w.id === v ? ' selected' : ''}>${U.esc(w.name)}</option>`).join('')}</select></label>`).join('')}</div>
  ${chosen.length ? `<div class="card"><h3 class="h3">Coverage</h3><ul class="wz-att">${BANDS.map(([k, l]) => `<li><span>${l}</span><b>${cov[k].length ? U.esc(cov[k].join(', ')) : 'Not covered'}</b></li>`).join('')}<li><span>Equipment utility</span><b>Data unavailable</b></li></ul>
    <p class="small">${miss.length ? 'Gaps to fill. Top Warzone options: ' + U.esc(sug.join('; ')) + '.' : 'Every distance is covered.'}</p></div>` : ''}`;
}
const NOTE = {
  warzone: 'Ordered by Warzone meta status, then close-range kill time. Every number is for the gun\'s top Warzone loadout after the Season 1 patch (Nov 6), so do not compare them with Multiplayer numbers. TTK is the time to kill in milliseconds. Shotguns and snipers have no TTK listed.',
  dmz: 'The top DMZ loadout for each gun. Check the date: builds from before the Season 1 patch may have changed.',
  resurgence: 'Resurgence is a Warzone playlist, so it uses the same guns and attachments. These are the Warzone builds. Builds made only for Resurgence are not available, and a gun that is strong in Warzone can play differently on the smaller map.'
};
function load() {
  if (M.data || M.loading) return; M.loading = true;
  fetch('data/warzone-stats.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { M.stats = d; }).catch(() => { M.stats = null; })
    .then(() => fetch('data/loadouts.json', { cache: 'no-cache' })).then(r => r.json()).then(d => { M.data = d; }).catch(() => { M.data = { modes: {}, failed: true }; })
    .then(() => { M.loading = false; if (S.view === 'wz') { const y = scrollY; go('wz'); scrollTo(0, y); } });
}
const ORDER = { 'Absolute Meta': 0, 'Meta': 1, 'Contenders': 2, 'Average Performers': 3, 'Below Average': 4 };
const wzs = id => (M.stats && M.stats.guns && M.stats.guns[id]) || null;
const wzm = id => { const g = wzs(id); return g && g.status ? { status: g.status } : ((M.data && M.data.warzoneMeta && M.data.warzoneMeta[id]) || null); };
const ttkOf = id => { const g = wzs(id); return g && g.ttk10 ? g.ttk10 : 99999; };
const byMeta = (a, b) => ((ORDER[(wzm(a.id) || {}).status] ?? 5) - (ORDER[(wzm(b.id) || {}).status] ?? 5)) || (ttkOf(a.id) - ttkOf(b.id)) || a.name.localeCompare(b.name);
const f1 = n => (Math.round(n * 100) / 100).toString();
function statsHTML(id) {
  const g = wzs(id); if (!g) return '';
  const T = [['TTK 0-10 m', g.ttk10, ' ms'], ['TTK 10-40 m', g.ttk40, ' ms'], ['TTK 40-80 m', g.ttk80, ' ms'], ['TTK 80-120 m', g.ttk120, ' ms'], ['Head multiplier', g.headMult, 'x'], ['Fire rate', g.rpm, ' rpm'], ['Bullet velocity', g.vel, ' m/s'], ['Hitscan range', g.hitscan, ' m'], ['Horizontal recoil', g.hRecoil, ''], ['Vertical recoil', g.vRecoil, ''], ['ADS speed', g.ads, ' ms'], ['Sprint to fire', g.stf, ' ms'], ['Reload', g.reload, ' ms'], ['Magazine', g.mag, ''], ['Penetration', g.pen, ' in'], ['Zoom', g.zoom > 1 ? g.zoom : null, 'x']].filter(t => t[1] != null);
  return `<dl class="wz-stats">${T.map(t => `<div><dt>${t[0]}</dt><dd>${U.esc(f1(t[1]) + t[2])}</dd></div>`).join('')}</dl>`;
}
function row(w, b, rank) {
  const un = b.unverified && b.unverified.length;
  return `<article class="card wz-row"><div class="wz-top">${S.W[w.id] ? `<button class="plate" data-gun="${U.esc(w.id)}" aria-label="${U.esc(w.name)} details">${U.gunPic(w)}</button>` : `<span class="plate">${U.gunPic(w)}</span>`}
    <div><h3 class="h3">${U.esc(w.name)}</h3>${M.mode === 'warzone' && wzm(w.id) ? `<p class="small"><b>#${rank} · ${U.esc(wzm(w.id).status)}</b></p>` : ''}<p class="small muted">${U.esc((S.C[w.cat] || {}).one || '')} · ${U.esc(b.n)}</p></div></div>
    ${M.mode === 'warzone' ? statsHTML(w.id) : (b.ttk ? `<p class="small muted">${b.ttk} ms avg TTK ${U.esc(b.ttkRange || '')}</p>` : '')}
    <ul class="wz-att">${b.att.map(a => `<li><span>${U.esc(a.s)}</span><b>${U.esc(a.n)}</b></li>`).join('')}</ul>
    ${un ? `<p class="small muted">No stat data here for: ${U.esc(b.unverified.join(', '))}.</p>` : ''}
    <div class="wz-foot"><span class="small muted">${b.updated ? 'Updated ' + U.esc(U.fmtDay(b.updated)) : ''}</span>${S.W[w.id] ? `<button class="btn sm" data-wz="use" data-w="${U.esc(w.id)}">Use build</button>` : ''}</div></article>`;
}
function html() {
  load();
  const chips = MODES.map(([k, l]) => `<button class="chip" data-wz="mode" data-v="${k}" aria-pressed="${M.mode === k}">${l}</button>`).join('');
  const dm = M.mode === 'resurgence' ? 'warzone' : M.mode;
  let body;
  if (!M.data) body = '<div class="card"><p class="muted">Loading builds…</p></div>';
  else if (M.mode === 'squad') body = squadHTML();
  else if (!(M.data.modes || {})[dm]) {
    body = `<div class="card"><h3 class="h3">Data unavailable</h3><p class="muted">No verified builds are available for this mode yet.</p></div>`;
  } else {
    const byGun = M.data.modes[dm], cats = [['all', 'All'], ...Object.entries(S.C).filter(([k, c]) => c.class === 'primary' || k === 'pistol').map(([k, c]) => [k, c.short])];
    const extra = M.mode === 'warzone' ? Object.entries((M.stats || {}).guns || {}).filter(([id, g]) => !byGun[id] && g.build).map(([id, g]) => S.W[id] || ({ id, name: g.name, cat: g.cat || 'ar', photo: g.photo, slots: [] })) : [];
    extra.forEach(w => { byGun[w.id] = byGun[w.id] || [{ n: (wzs(w.id) || {}).role || 'Long Range', att: wzs(w.id).build, updated: (M.stats || {}).updated }]; });
    const guns = S.g.weapons.concat(extra.filter(w => !S.W[w.id])).filter(w => byGun[w.id] && (M.cat === 'all' || w.cat === M.cat)).sort((a, b) => M.mode === 'warzone' ? byMeta(a, b) : a.name.localeCompare(b.name));
    const missing = S.g.weapons.filter(w => w.live && w.cat !== 'launcher' && w.cat !== 'melee' && !byGun[w.id]).map(w => w.name);
    body = `<div class="chips" role="group" aria-label="Weapon class">${cats.map(([k, l]) => `<button class="chip" data-wz="cat" data-v="${k}" aria-pressed="${M.cat === k}">${U.esc(l)}</button>`).join('')}</div>
      <p class="small muted">${NOTE[M.mode]}</p>${guns.map((w, i) => row(w, byGun[w.id][0], i + 1)).join('') || '<div class="card"><p class="muted">No builds for this class.</p></div>'}
      ${missing.length ? `<p class="small muted">No verified build yet: ${U.esc(missing.join(', '))}.</p>` : ''}`;
  }
  return `<section class="sec wz"><div><p class="eyebrow">Meta by mode</p><h2 class="h">Best loadouts</h2></div>
    <div class="chips" role="group" aria-label="Mode">${chips}</div>${body}</section>`;
}
const css = document.createElement('style');
css.textContent = '.wz{display:grid;gap:12px}.wz-row{display:grid;gap:10px}.wz-top{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:center}.wz-att{list-style:none;margin:0;padding:0;display:grid;gap:6px}.wz-att li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding:6px 0;min-width:0}.wz-att span{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.wz-att b{text-align:right;min-width:0;overflow-wrap:anywhere}.wz-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}.wz .btn{min-height:44px}.wz-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:0}.wz-stats div{background:rgba(155,123,255,.08);border-radius:10px;padding:8px 10px;min-width:0}.wz-stats dt{color:var(--muted);font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}.wz-stats dd{margin:2px 0 0;font-weight:700}';
document.head.appendChild(css);
document.addEventListener('change', e => {
  const t = e.target.closest && e.target.closest('select[data-wz="pick"]'); if (!t) return;
  Q.picks[Number(t.dataset.i)] = t.value; const y = scrollY; go('wz'); scrollTo(0, y);
});
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button[data-wz]'); if (!t) return;
  const a = t.dataset.wz;
  if (a === 'mode') { M.mode = t.dataset.v; M.cat = 'all'; }
  else if (a === 'cat') M.cat = t.dataset.v;
  else if (a === 'size') Q.size = Number(t.dataset.v);
  else if (a === 'use') {
    const w = S.W[t.dataset.w], b = ((M.data.modes[M.mode === 'resurgence' ? 'warzone' : M.mode] || {})[w.id] || [])[0]; if (!b) return;
    const L = JSON.parse(JSON.stringify(S.L)), slot = { w: w.id, att: b.att.filter(x => x.s !== 'Apex').map(x => ({ s: x.s, n: x.n })), apex: false };
    if (U.cls(w) === 'secondary') L.s = slot; else L.p = slot;
    L.name = (`${w.name} ${b.n}`).slice(0, 40); S.L = U.sanitize(L); U.toast(`Loaded ${w.name} ${b.n}`); go('build'); return;
  }
  const y = scrollY; go('wz'); scrollTo(0, y);
});
window.KuModes = { html };
})();
