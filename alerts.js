/* Kit Up alerts: a bell in the header that tells you when a patch changes a gun you care about.
   "Guns you care about" = guns you starred, plus guns in your saved loadouts.
   Official patch changes and community pick-rate moves are kept apart and labelled. Everything stays on your device. */
(function () {
'use strict';
if (typeof window === 'undefined' || !document.addEventListener) return;
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const SEEN = 'ku.alerts.seen.v1';
const read = () => { try { return localStorage.getItem(SEEN) || ''; } catch (e) { return ''; } };
const write = v => { try { localStorage.setItem(SEEN, v); } catch (e) {} };
const TYPE = { buff: 'Buff', nerf: 'Nerf', adjust: 'Change' };

/** Which guns matter to this player, and why. */
function watched() {
  const why = {};
  const add = (id, r) => { if (!S.W[id]) return; (why[id] = why[id] || new Set()).add(r); };
  if (S.favs) S.favs.forEach(id => add(id, 'starred'));
  (U.readSaved ? U.readSaved() : []).forEach(sv => {
    const L = U.decode && U.decode(sv.code); if (!L) return;
    [L.p.w, L.s.w].forEach(id => add(id, 'loadout:' + sv.name));
  });
  return why;
}

/** All alerts, newest first. */
function collect() {
  if (!S.g || !S.patches) return [];
  const why = watched(), out = [];
  S.patches.forEach(p => (p.changes || []).forEach(ch => {
    if (!why[ch.weapon]) return;
    const loads = [...why[ch.weapon]].filter(r => r.startsWith('loadout:')).map(r => r.slice(8));
    out.push({ kind: 'official', date: p.date, patch: p, ch, loads, starred: why[ch.weapon].has('starred') });
  }));
  // Community-derived: the pick rate of a watched gun moved by a point or more since the previous daily snapshot.
  const H = S.hist;
  if (H && H.days && H.days.length > 1) {
    const last = H.days[H.days.length - 1];
    Object.keys(why).forEach(id => {
      const a = (H.picks && H.picks[id]) || [], n = a.length;
      if (n > 1 && a[n - 1] != null && a[n - 2] != null && Math.abs(a[n - 1] - a[n - 2]) >= 1)
        out.push({ kind: 'community', date: last, id, from: a[n - 2], to: a[n - 1] });
    });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
const unread = list => { const seen = read(); return list.filter(a => (a.date || '') > seen); };

function badge() {
  const b = document.getElementById('ku-bell'); if (!b) return;
  let n = 0; try { n = unread(collect()).length; } catch (e) {}
  b.dataset.n = n; b.setAttribute('aria-label', n ? `Alerts, ${n} new` : 'Alerts');
  const dot = b.querySelector('.ku-dot'); if (dot) { dot.textContent = n > 9 ? '9+' : n; dot.hidden = !n; }
}

function item(a) {
  const esc = U.esc;
  if (a.kind === 'official') {
    const w = S.W[a.ch.weapon], mine = a.loads.length ? `<p class="ku-imp">Hits your loadout${a.loads.length > 1 ? 's' : ''}: ${a.loads.map(esc).join(', ')}. <button class="linkish" data-ku="gunsmith">Rebuild it in Gunsmith</button></p>` : '';
    return `<li class="ku-a"><div class="ku-h"><span class="tag ${esc(a.ch.type)}">${esc(TYPE[a.ch.type] || 'Change')}</span><b><button class="linkish" data-ku="gun" data-id="${esc(w.id)}">${esc(w.name)}</button></b><small>Official · ${esc(U.fmtDay(a.date))}</small></div>
      <p>${esc(a.ch.text)}</p>${mine}${a.patch.url ? `<a class="ku-l" href="${esc(a.patch.url)}" target="_blank" rel="noopener">Read the patch note</a>` : ''}</li>`;
  }
  const w = S.W[a.id], up = a.to > a.from;
  return `<li class="ku-a"><div class="ku-h"><span class="tag ${up ? 'buff' : 'nerf'}">${up ? 'Rising' : 'Falling'}</span><b><button class="linkish" data-ku="gun" data-id="${esc(a.id)}">${esc(w.name)}</button></b><small>Community data · ${esc(U.fmtDay(a.date))}</small></div>
    <p>Pick rate ${a.from}% to ${a.to}% since the last daily snapshot. This comes from live match data, not an official change.</p></li>`;
}

function open() {
  const list = collect(), seen = read();
  let el = document.getElementById('ku-panel'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'ku-panel'; el.className = 'ku-panel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Alerts');
  const watching = Object.keys(watched()).length;
  el.innerHTML = `<div class="ku-card"><div class="ku-top"><b>Alerts</b><span><button class="linkish" data-ku="read">Mark all read</button><button class="x" data-ku="close" aria-label="Close">×</button></span></div>
    ${list.length ? `<ul class="ku-list">${list.map(a => `<div class="${(a.date || '') > seen ? 'ku-new' : ''}">${item(a)}</div>`).join('')}</ul>`
      : `<div class="ku-empty"><b>${watching ? 'No changes to your guns yet.' : 'Nothing to watch yet.'}</b><p>${watching ? 'When a patch changes a gun you starred or use in a loadout, it shows up here.' : 'Star a gun, or save a loadout, and patch changes to those guns show up here.'}</p></div>`}
    <p class="small muted">Watching ${watching} gun${watching === 1 ? '' : 's'}: the ones you starred and the ones in your saved loadouts. Official means it came from the game's patch notes. Community means it came from live pick rates.</p>
    <p class="small muted">Want pings on your phone? The Kit Up Discord has a Meta Alerts role.</p></div>`;
  document.body.appendChild(el);
  const c = el.querySelector('.x'); if (c) c.focus();
}
function close() { const el = document.getElementById('ku-panel'); if (el) el.remove(); }
function markRead() {
  const list = collect(); const newest = list.reduce((m, a) => ((a.date || '') > m ? a.date : m), read());
  write(newest || read()); badge(); if (document.getElementById('ku-panel')) open();
}

function mount() {
  if (document.getElementById('ku-bell')) return true;
  const r = document.querySelector('.top-r'); if (!r || !window.S || !S.g) return false;
  const b = document.createElement('button'); b.className = 'theme-b'; b.id = 'ku-bell'; b.setAttribute('aria-label', 'Alerts'); b.dataset.ku = 'open';
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="ln" d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0"/></svg><i class="ku-dot" hidden></i>';
  r.insertBefore(b, r.firstChild); badge(); return true;
}
const st = document.createElement('style');
st.textContent = `#ku-bell{position:relative}#ku-bell svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.ku-dot{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--accent,#9B7BFF);color:var(--on-accent,#fff);font:800 .6rem/16px var(--f-body,inherit);text-align:center;font-style:normal}
.ku-panel{position:fixed;inset:0;z-index:60;background:rgba(5,3,12,.7);display:grid;place-items:end center;padding:0}.ku-card{width:100%;max-width:560px;max-height:86vh;overflow:auto;background:var(--surface,#14101f);border:1px solid var(--line);border-radius:18px 18px 0 0;padding:14px 14px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:10px;box-sizing:border-box}
.ku-top{display:flex;justify-content:space-between;align-items:center;font:800 1.05rem/1 var(--f-display,inherit);text-transform:uppercase}.ku-top span{display:flex;gap:10px;align-items:center}.ku-top .x{min-width:44px;min-height:44px;background:none;border:0;color:var(--ink);font-size:1.5rem;cursor:pointer}
.ku-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.ku-a{list-style:none;display:grid;gap:5px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--raised)}.ku-new .ku-a{border-color:var(--accent,#9B7BFF)}
.ku-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ku-h small{margin-left:auto;color:var(--muted);font-size:.68rem}.ku-a p{margin:0;font-size:.86rem}.ku-imp{color:var(--accent-text,var(--ink))}.ku-l{font-size:.78rem}.ku-empty{padding:10px 0}`;
document.head.appendChild(st);

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-ku]'); if (!t) { setTimeout(badge, 50); return; }
  const a = t.dataset.ku;
  if (a === 'open') open();
  else if (a === 'close') close();
  else if (a === 'read') markRead();
  else if (a === 'gun') { close(); go('g-' + t.dataset.id); }
  else if (a === 'gunsmith') { close(); go('build'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
document.addEventListener('click', e => { if (e.target && e.target.id === 'ku-panel') close(); });
let tries = 0; const iv = setInterval(() => { if (mount() || ++tries > 60) clearInterval(iv); }, 500);
window.addEventListener('hashchange', badge);
window.KuAlerts = { collect, unread, watched };
})();
