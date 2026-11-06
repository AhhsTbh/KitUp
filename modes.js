/* Kit Up: best loadouts per mode (Warzone, DMZ, Resurgence). Data: data/loadouts.json. */
(function () {
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const M = { mode: 'warzone', cat: 'all', data: null, loading: false };
const MODES = [['warzone', 'Warzone'], ['dmz', 'DMZ'], ['resurgence', 'Resurgence']];
const NOTE = {
  warzone: 'The top loadout for each gun in Warzone. The kill time shown is the average for that loadout at close range in Warzone, so do not compare it with Multiplayer numbers.',
  dmz: 'The top DMZ loadout for each gun. Check the date: builds from before the Season 1 patch may have changed.',
  resurgence: ''
};
function load() {
  if (M.data || M.loading) return; M.loading = true;
  fetch('data/loadouts.json', { cache: 'no-cache' }).then(r => r.json()).then(d => { M.data = d; }).catch(() => { M.data = { modes: {}, failed: true }; })
    .then(() => { M.loading = false; if (S.view === 'wz') { const y = scrollY; go('wz'); scrollTo(0, y); } });
}
function row(w, b) {
  const un = b.unverified && b.unverified.length;
  return `<article class="card wz-row"><div class="wz-top"><button class="plate" data-gun="${U.esc(w.id)}" aria-label="${U.esc(w.name)} details">${U.gunPic(w)}</button>
    <div><h3 class="h3">${U.esc(w.name)}</h3><p class="small muted">${U.esc((S.C[w.cat] || {}).one || '')} · ${U.esc(b.n)}${b.ttk ? ` · ${b.ttk} ms avg TTK ${U.esc(b.ttkRange || '')}` : ''}</p></div></div>
    <ul class="wz-att">${b.att.map(a => `<li><span>${U.esc(a.s)}</span><b>${U.esc(a.n)}</b></li>`).join('')}</ul>
    ${un ? `<p class="small muted">No stat data here for: ${U.esc(b.unverified.join(', '))}.</p>` : ''}
    <div class="wz-foot"><span class="small muted">${b.updated ? 'Updated ' + U.esc(U.fmtDay(b.updated)) : ''}</span><button class="btn sm" data-wz="use" data-w="${U.esc(w.id)}">Use build</button></div></article>`;
}
function html() {
  load();
  const chips = MODES.map(([k, l]) => `<button class="chip" data-wz="mode" data-v="${k}" aria-pressed="${M.mode === k}">${l}</button>`).join('');
  let body;
  if (!M.data) body = '<div class="card"><p class="muted">Loading builds…</p></div>';
  else if (M.mode === 'resurgence' || !(M.data.modes || {})[M.mode]) {
    body = `<div class="card"><h3 class="h3">Data unavailable</h3><p class="muted">No Resurgence loadouts are available in a form that can be checked, so none are shown. They'll appear here once verified builds exist.</p></div>`;
  } else {
    const byGun = M.data.modes[M.mode], cats = [['all', 'All'], ...Object.entries(S.C).filter(([k, c]) => c.class === 'primary' || k === 'pistol').map(([k, c]) => [k, c.short])];
    const guns = S.g.weapons.filter(w => byGun[w.id] && (M.cat === 'all' || w.cat === M.cat)).sort((a, b) => a.name.localeCompare(b.name));
    const missing = S.g.weapons.filter(w => w.live && w.cat !== 'launcher' && w.cat !== 'melee' && !byGun[w.id]).map(w => w.name);
    body = `<div class="chips" role="group" aria-label="Weapon class">${cats.map(([k, l]) => `<button class="chip" data-wz="cat" data-v="${k}" aria-pressed="${M.cat === k}">${U.esc(l)}</button>`).join('')}</div>
      <p class="small muted">${NOTE[M.mode]}</p>${guns.map(w => row(w, byGun[w.id][0])).join('') || '<div class="card"><p class="muted">No builds for this class.</p></div>'}
      ${missing.length ? `<p class="small muted">No verified build yet: ${U.esc(missing.join(', '))}.</p>` : ''}`;
  }
  return `<section class="sec wz"><div><p class="eyebrow">Meta by mode</p><h2 class="h">Best loadouts</h2></div>
    <div class="chips" role="group" aria-label="Mode">${chips}</div>${body}</section>`;
}
const css = document.createElement('style');
css.textContent = '.wz{display:grid;gap:12px}.wz-row{display:grid;gap:10px}.wz-top{display:grid;grid-template-columns:84px 1fr;gap:12px;align-items:center}.wz-att{list-style:none;margin:0;padding:0;display:grid;gap:6px}.wz-att li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px dashed var(--line);padding:6px 0;min-width:0}.wz-att span{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.06em}.wz-att b{text-align:right;min-width:0;overflow-wrap:anywhere}.wz-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}.wz .btn{min-height:44px}';
document.head.appendChild(css);
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-wz]'); if (!t) return;
  const a = t.dataset.wz;
  if (a === 'mode') { M.mode = t.dataset.v; M.cat = 'all'; }
  else if (a === 'cat') M.cat = t.dataset.v;
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
