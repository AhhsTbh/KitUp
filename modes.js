/* Kit Up: best loadouts per mode (Warzone, DMZ, Resurgence). Data: data/loadouts.json. */
(function () {
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const M = { mode: 'warzone', cat: 'all', data: null, loading: false };
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
  const sug = miss.map(([k, l]) => { const cands = opts.filter(w => bandsOf(w.id).has(k)).sort((a, b) => ((ORDER[(wzm(a.id) || {}).status] ?? 5) - (ORDER[(wzm(b.id) || {}).status] ?? 5)) || ((wzm(b.id) || {}).pick || 0) - ((wzm(a.id) || {}).pick || 0)); return cands[0] ? `${l}: ${cands[0].name} (${(wzm(cands[0].id) || {}).status || 'no meta status'})` : `${l}: no suggestion`; });
  return `<div class="card"><p class="small muted">Pick each teammate's main gun. The check looks at which fighting distances your squad covers, using each gun's class and its top Warzone loadout. It is a strategy guide, not a calculation from game mechanics.</p>
    <div class="chips" role="group" aria-label="Squad size">${[2, 3, 4].map(n => `<button class="chip" data-wz="size" data-v="${n}" aria-pressed="${Q.size === n}">${n} players</button>`).join('')}</div>
    ${picks.map((v, i) => `<label class="small muted">Player ${i + 1}<select class="lab-i wz-sel" data-wz="pick" data-i="${i}" aria-label="Player ${i + 1} main gun"><option value="">Choose a gun</option>${opts.map(w => `<option value="${U.esc(w.id)}"${w.id === v ? ' selected' : ''}>${U.esc(w.name)}</option>`).join('')}</select></label>`).join('')}</div>
  ${chosen.length ? `<div class="card"><h3 class="h3">Coverage</h3><ul class="wz-att">${BANDS.map(([k, l]) => `<li><span>${l}</span><b>${cov[k].length ? U.esc(cov[k].join(', ')) : 'Not covered'}</b></li>`).join('')}<li><span>Equipment utility</span><b>Data unavailable</b></li></ul>
    <p class="small">${miss.length ? 'Gaps to fill. Top Warzone options: ' + U.esc(sug.join('; ')) + '.' : 'Every distance is covered.'}</p></div>` : ''}`;
}
const NOTE = {
  warzone: 'Ranked by Warzone meta status, then pick rate. Pick rate shows how popular a gun is, not how strong it is. This is the top loadout for each gun. The kill time shown is the average for that loadout at close range in Warzone, so do not compare it with Multiplayer numbers.',
  dmz: 'The top DMZ loadout for each gun. Check the date: builds from before the Season 1 patch may have changed.',
  resurgence: ''
};
function load() {
  if (M.data || M.loading) return; M.loading = true;
  fetch('data/loadouts.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { M.data = d; }).catch(() => { M.data = { modes: {}, failed: true }; })
    .then(() => { M.loading = false; if (S.view === 'wz') { const y = scrollY; go('wz'); scrollTo(0, y); } });
}
const ORDER = { 'Absolute Meta': 0, 'Meta': 1, 'Contenders': 2, 'Average Performers': 3, 'Below Average': 4 };
const wzm = id => (M.data && M.data.warzoneMeta && M.data.warzoneMeta[id]) || null;
function row(w, b, rank) {
  const un = b.unverified && b.unverified.length;
  return `<article class="card wz-row"><div class="wz-top"><button class="plate" data-gun="${U.esc(w.id)}" aria-label="${U.esc(w.name)} details">${U.gunPic(w)}</button>
    <div><h3 class="h3">${U.esc(w.name)}</h3>${M.mode === 'warzone' && wzm(w.id) ? `<p class="small"><b>#${rank} · ${U.esc(wzm(w.id).status)}</b> · ${wzm(w.id).pick}% pick rate</p>` : ''}<p class="small muted">${U.esc((S.C[w.cat] || {}).one || '')} · ${U.esc(b.n)}${b.ttk ? ` · ${b.ttk} ms avg TTK ${U.esc(b.ttkRange || '')}` : ''}</p></div></div>
    <ul class="wz-att">${b.att.map(a => `<li><span>${U.esc(a.s)}</span><b>${U.esc(a.n)}</b></li>`).join('')}</ul>
    ${un ? `<p class="small muted">No stat data here for: ${U.esc(b.unverified.join(', '))}.</p>` : ''}
    <div class="wz-foot"><span class="small muted">${b.updated ? 'Updated ' + U.esc(U.fmtDay(b.updated)) : ''}</span><button class="btn sm" data-wz="use" data-w="${U.esc(w.id)}">Use build</button></div></article>`;
}
function html() {
  load();
  const chips = MODES.map(([k, l]) => `<button class="chip" data-wz="mode" data-v="${k}" aria-pressed="${M.mode === k}">${l}</button>`).join('');
  let body;
  if (!M.data) body = '<div class="card"><p class="muted">Loading builds…</p></div>';
  else if (M.mode === 'squad') body = squadHTML();
  else if (M.mode === 'resurgence' || !(M.data.modes || {})[M.mode]) {
    body = `<div class="card"><h3 class="h3">Data unavailable</h3><p class="muted">No Resurgence loadouts are available in a form that can be checked, so none are shown. They'll appear here once verified builds exist.</p></div>`;
  } else {
    const byGun = M.data.modes[M.mode], cats = [['all', 'All'], ...Object.entries(S.C).filter(([k, c]) => c.class === 'primary' || k === 'pistol').map(([k, c]) => [k, c.short])];
    const guns = S.g.weapons.filter(w => byGun[w.id] && (M.cat === 'all' || w.cat === M.cat)).sort((a, b) => M.mode === 'warzone' ? ((ORDER[(wzm(a.id) || {}).status] ?? 5) - (ORDER[(wzm(b.id) || {}).status] ?? 5) || ((wzm(b.id) || {}).pick || 0) - ((wzm(a.id) || {}).pick || 0) || a.name.localeCompare(b.name)) : a.name.localeCompare(b.name));
    const missing = S.g.weapons.filter(w => w.live && w.cat !== 'launcher' && w.cat !== 'melee' && !byGun[w.id]).map(w => w.name);
    body = `<div class="chips" role="group" aria-label="Weapon class">${cats.map(([k, l]) => `<button class="chip" data-wz="cat" data-v="${k}" aria-pressed="${M.cat === k}">${U.esc(l)}</button>`).join('')}</div>
      <p class="small muted">${NOTE[M.mode]}</p>${guns.map((w, i) => row(w, byGun[w.id][0], i + 1)).join('') || '<div class="card"><p class="muted">No builds for this class.</p></div>'}
      ${missing.length ? `<p class="small muted">No verified build yet: ${U.esc(missing.join(', '))}.</p>` : ''}`;
  }
  return `<section class="sec wz"><div><p class="eyebrow">Meta by mode</p><h2 class="h">Best loadouts</h2></div>
    <div class="chips" role="group" aria-label="Mode">${chips}</div>${body}</section>`;
}
const css = document.createElement('style');
css.textContent = '.wz{display:grid;gap:12px}.wz-row{display:grid;gap:10px}.wz-top{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:center}.wz-att{list-style:none;margin:0;padding:0;display:grid;gap:6px}.wz-att li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding:6px 0;min-width:0}.wz-att span{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.wz-att b{text-align:right;min-width:0;overflow-wrap:anywhere}.wz-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}.wz .btn{min-height:44px}';
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
    const w = S.W[t.dataset.w], b = ((M.data.modes[M.mode] || {})[w.id] || [])[0]; if (!b) return;
    const L = JSON.parse(JSON.stringify(S.L)), slot = { w: w.id, att: b.att.filter(x => x.s !== 'Apex').map(x => ({ s: x.s, n: x.n })), apex: false };
    if (U.cls(w) === 'secondary') L.s = slot; else L.p = slot;
    L.name = (`${w.name} ${b.n}`).slice(0, 40); S.L = U.sanitize(L); U.toast(`Loaded ${w.name} ${b.n}`); go('build'); return;
  }
  const y = scrollY; go('wz'); scrollTo(0, y);
});
window.KuModes = { html };
})();
