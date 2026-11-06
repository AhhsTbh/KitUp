/* Kit Up map planner: draw a plan on a map's real overhead layout (or its official hero image or screenshots).
   Nothing is invented: the map pictures are the ones already in data/maps.json, and the marks are yours.
   Plans are saved on your device and can be shared as a link or exported as a PNG. */
(function () {
'use strict';
if (typeof window === 'undefined' || !document.addEventListener) return;
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const COLORS = { red: '#FF5A5F', gold: '#F2B726', green: '#3DDC97', violet: '#B79CFF', white: '#F4F1FB' };
const MARKS = { obj: ['★', 'Objective'], hold: ['●', 'Hold'], danger: ['✖', 'Danger'], push: ['➜', 'Push'], eye: ['◉', 'Sightline'], bomb: ['▣', 'Site'] };
const P = { id: null, ops: [], tool: 'pen', color: 'violet', mark: 'obj', zoom: 1, bg: 0, cur: null, img: null, w: 1200, h: 840, text: '' };
const key = id => 'ku.plan.' + id;

function backgrounds(m) {
  const b = [];
  if (m.layout) b.push({ n: 'Overhead layout', src: m.layout });
  if (m.img) b.push({ n: 'Hero image', src: m.img });
  (m.shots || []).forEach((s, i) => b.push({ n: 'Screenshot ' + (i + 1), src: s }));
  return b;
}
const find = id => { for (const p of S.maps.playlists) for (const m of p.maps) if (m.id === id) return m; return null; };

function load(id) { try { const a = JSON.parse(localStorage.getItem(key(id)) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function save() { try { localStorage.setItem(key(P.id), JSON.stringify(P.ops)); return true; } catch (e) { return false; } }

/* ---------- drawing ---------- */
function paint(c, ctx, withBg) {
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (withBg && P.img && P.img.complete && P.img.naturalWidth) {
    const k = Math.min(W / P.img.naturalWidth, H / P.img.naturalHeight), dw = P.img.naturalWidth * k, dh = P.img.naturalHeight * k;
    ctx.fillStyle = '#0B0912'; ctx.fillRect(0, 0, W, H); ctx.drawImage(P.img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else if (withBg) { ctx.fillStyle = '#0B0912'; ctx.fillRect(0, 0, W, H); }
  const ops = P.cur ? P.ops.concat([P.cur]) : P.ops;
  ops.forEach(o => draw(ctx, o, W, H));
}
function draw(ctx, o, W, H) {
  const col = COLORS[o.c] || COLORS.violet, X = v => v * W, Y = v => v * H, lw = Math.max(3, W / 240);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.t === 'p' && o.pts.length > 1) { ctx.beginPath(); o.pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); }
  else if (o.t === 'a') {
    const [ax, ay] = [X(o.a[0]), Y(o.a[1])], [bx, by] = [X(o.b[0]), Y(o.b[1])], ang = Math.atan2(by - ay, bx - ax), hl = lw * 5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - hl * Math.cos(ang - .45), by - hl * Math.sin(ang - .45)); ctx.lineTo(bx - hl * Math.cos(ang + .45), by - hl * Math.sin(ang + .45)); ctx.closePath(); ctx.fill();
  } else if (o.t === 'm') {
    const r = W / 38; ctx.beginPath(); ctx.arc(X(o.x), Y(o.y), r, 0, 7); ctx.fillStyle = 'rgba(8,6,16,.82)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.font = `700 ${Math.round(r * 1.2)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((MARKS[o.k] || MARKS.obj)[0], X(o.x), Y(o.y) + 1);
  } else if (o.t === 't') {
    const fs = Math.round(W / 30); ctx.font = `700 ${fs}px system-ui,sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(o.s).width; ctx.fillStyle = 'rgba(8,6,16,.78)'; ctx.fillRect(X(o.x) - 6, Y(o.y) - fs * .7, w + 12, fs * 1.4); ctx.fillStyle = col; ctx.fillText(o.s, X(o.x), Y(o.y));
  }
}
function redraw() { const c = document.getElementById('kp-c'); if (c) paint(c, c.getContext('2d'), true); }

/* ---------- view ---------- */
function html(m) {
  const bgs = backgrounds(m);
  if (!bgs.length) return '';
  if (P.id !== m.id) { P.id = m.id; P.ops = load(m.id); P.bg = 0; P.cur = null; P.zoom = 1; }
  setTimeout(mount, 0);
  const tool = (k, label) => `<button data-kp="tool" data-v="${k}" aria-pressed="${P.tool === k}">${label}</button>`;
  return `<div class="card kp" id="kp">
    <div class="sec-head"><h3 class="h3">Plan this map</h3><span class="small muted">${P.ops.length} mark${P.ops.length === 1 ? '' : 's'}</span></div>
    <p class="small muted">Draw routes, call out holds and sightlines, and share the plan with your squad. The map picture is the official one from Call of Duty, and the marks are only what you draw.</p>
    <div class="kp-row" role="group" aria-label="Tools">${tool('move', 'Move')}${tool('pen', 'Draw')}${tool('arrow', 'Arrow')}${tool('mark', 'Marker')}${tool('text', 'Label')}</div>
    <div class="kp-row" role="group" aria-label="Colour">${Object.entries(COLORS).map(([k, c]) => `<button class="kp-c" data-kp="color" data-v="${k}" aria-pressed="${P.color === k}" aria-label="${k}" style="--sw:${c}"></button>`).join('')}</div>
    ${P.tool === 'mark' ? `<div class="kp-row" role="group" aria-label="Marker type">${Object.entries(MARKS).map(([k, [g, n]]) => `<button data-kp="mark" data-v="${k}" aria-pressed="${P.mark === k}">${g} ${n}</button>`).join('')}</div>` : ''}
    ${P.tool === 'text' ? `<div class="kp-row"><input id="kp-t" maxlength="24" placeholder="Label text, then tap the map" value="${U.esc(P.text)}" aria-label="Label text"></div>` : ''}
    <div class="kp-wrap" id="kp-wrap" style="--z:${P.zoom}"><canvas id="kp-c" width="${P.w}" height="${P.h}" aria-label="Map plan canvas" style="touch-action:${P.tool === 'move' ? 'auto' : 'none'}"></canvas></div>
    <div class="kp-row"><button data-kp="zoom" data-v="-1" aria-label="Zoom out">−</button><span class="small muted kp-z">${Math.round(P.zoom * 100)}%</span><button data-kp="zoom" data-v="1" aria-label="Zoom in">+</button>
      ${bgs.length > 1 ? `<select id="kp-bg" aria-label="Map picture">${bgs.map((b, i) => `<option value="${i}"${i === P.bg ? ' selected' : ''}>${U.esc(b.n)}</option>`).join('')}</select>` : ''}</div>
    <div class="kp-row"><button data-kp="undo">Undo</button><button data-kp="clear">Clear</button><button data-kp="save">Save</button><button data-kp="png">Download PNG</button><button data-kp="link">Copy link</button></div>
    <p class="small muted">${m.layout ? 'The overhead layout is the largest official overhead image available for this map. ' : ''}Saved on this device. Overlays like spawns, rotations and bomb sites aren't shown because there's no verified data for them.</p>
  </div>`;
}
function mount() {
  const c = document.getElementById('kp-c'); if (!c) return;
  const m = find(P.id), bgs = m ? backgrounds(m) : []; if (!bgs.length) return;
  const src = bgs[Math.min(P.bg, bgs.length - 1)].src;
  const img = new Image(); img.onload = () => {
    P.img = img; const r = img.naturalWidth / img.naturalHeight; P.w = 1200; P.h = Math.round(1200 / Math.max(.8, Math.min(2.2, r)));
    c.width = P.w; c.height = P.h; redraw();
  }; img.src = src;
  redraw();
}

/* ---------- input ---------- */
const pos = (e, c) => { const r = c.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
const round = v => Math.round(v * 1000) / 1000;
document.addEventListener('pointerdown', e => {
  const c = e.target && e.target.id === 'kp-c' ? e.target : null; if (!c || P.tool === 'move') return;
  const [x, y] = pos(e, c).map(round);
  if (P.tool === 'pen') P.cur = { t: 'p', c: P.color, pts: [[x, y]] };
  else if (P.tool === 'arrow') P.cur = { t: 'a', c: P.color, a: [x, y], b: [x, y] };
  else if (P.tool === 'mark') { P.ops.push({ t: 'm', c: P.color, k: P.mark, x, y }); save(); redraw(); count(); return; }
  else if (P.tool === 'text') { const t = (document.getElementById('kp-t') || {}).value || P.text; if (!t.trim()) { U.toast('Type the label first'); return; } P.text = t; P.ops.push({ t: 't', c: P.color, x, y, s: t.trim().slice(0, 24) }); save(); redraw(); count(); return; }
  try { c.setPointerCapture(e.pointerId); } catch (err) {}
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!P.cur) return; const c = document.getElementById('kp-c'); if (!c) return;
  const [x, y] = pos(e, c).map(round);
  if (P.cur.t === 'p') { const l = P.cur.pts[P.cur.pts.length - 1]; if (Math.hypot(x - l[0], y - l[1]) > .004) P.cur.pts.push([x, y]); } else P.cur.b = [x, y];
  redraw();
});
const end = () => { if (!P.cur) return; const o = P.cur; P.cur = null; if ((o.t === 'p' && o.pts.length > 1) || (o.t === 'a' && Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) > .02)) { P.ops.push(o); save(); count(); } redraw(); };
document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
const count = () => { const s = document.querySelector('#kp .sec-head .small'); if (s) s.textContent = `${P.ops.length} mark${P.ops.length === 1 ? '' : 's'}`; };
const rerender = () => { const y = scrollY; if (window.kuRender) window.kuRender(); scrollTo(0, y); };

/* a plan as a link: marks are rounded to 3 digits and packed, so short plans fit in a normal URL */
function encode() { return btoa(unescape(encodeURIComponent(JSON.stringify({ m: P.id, o: P.ops })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decode(s) {
  try { let b = s.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '='; const o = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (!o || typeof o.m !== 'string' || !Array.isArray(o.o)) return null;
    const ok = x => x && ['p', 'a', 'm', 't'].includes(x.t) && COLORS[x.c];
    return { m: o.m.slice(0, 40), o: o.o.filter(ok).slice(0, 400) }; } catch (e) { return null; }
}
function importFromHash() {
  const h = location.hash || ''; const m = /^#plan-(.+)$/.exec(h); if (!m) return;
  const p = decode(m[1]); if (!p || !find(p.m)) return;
  try { localStorage.setItem(key(p.m), JSON.stringify(p.o)); } catch (e) {}
  P.id = null; history.replaceState(null, '', '#map-' + p.m); if (window.go) window.go('map-' + p.m); U.toast && U.toast('Plan loaded');
}

document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-kp]'); if (!t) return;
  const a = t.dataset.kp, v = t.dataset.v;
  if (a === 'tool') { P.tool = v; rerender(); }
  else if (a === 'color') { P.color = v; rerender(); }
  else if (a === 'mark') { P.mark = v; rerender(); }
  else if (a === 'zoom') { P.zoom = Math.min(3, Math.max(1, P.zoom + Number(v) * .5)); const w = document.getElementById('kp-wrap'); if (w) w.style.setProperty('--z', P.zoom); const z = document.querySelector('.kp-z'); if (z) z.textContent = Math.round(P.zoom * 100) + '%'; }
  else if (a === 'undo') { P.ops.pop(); save(); redraw(); count(); }
  else if (a === 'clear') { if (P.ops.length) { P.ops = []; save(); redraw(); count(); U.toast('Plan cleared'); } }
  else if (a === 'save') U.toast(save() ? 'Plan saved on this device' : "This browser won't save. Use Copy link instead.");
  else if (a === 'png') {
    const c = document.createElement('canvas'); c.width = P.w; c.height = P.h; paint(c, c.getContext('2d'), true);
    c.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = `kitup-${P.id}-plan.png`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png');
  } else if (a === 'link') {
    const url = location.origin + location.pathname + '#plan-' + encode();
    if (url.length > 6000) { U.toast('That plan is too big for a link. Download the PNG instead.'); return; }
    try { navigator.clipboard.writeText(url).then(() => U.toast('Plan link copied'), () => U.toast(url)); } catch (err) { U.toast(url); }
  }
});
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'kp-bg') { P.bg = Number(e.target.value) || 0; mount(); }
  if (e.target && e.target.id === 'kp-t') P.text = e.target.value;
});
document.addEventListener('input', e => { if (e.target && e.target.id === 'kp-t') P.text = e.target.value; });
window.addEventListener('load', () => setTimeout(importFromHash, 1500));
window.addEventListener('hashchange', () => { if (/^#plan-/.test(location.hash)) importFromHash(); });

const st = document.createElement('style');
st.textContent = `.kp{gap:10px}.kp-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.kp-row button,.kp-row select,.kp-row input{min-height:44px;border:1px solid var(--line);background:var(--raised);color:var(--ink);border-radius:10px;padding:0 12px;font:700 .78rem/1 var(--f-body,inherit);cursor:pointer}.kp-row input{flex:1 1 180px;font-size:16px;cursor:text}.kp-row select{font-size:16px}
.kp-row button[aria-pressed="true"]{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}.kp-row .kp-c{width:44px;padding:0;border-radius:50%;background:var(--sw);border:2px solid var(--line)}.kp-row .kp-c[aria-pressed="true"]{border-color:var(--ink);box-shadow:0 0 0 2px var(--bg,#000)}
.kp-wrap{overflow:auto;max-height:70vh;border:1px solid var(--line);border-radius:12px;background:#0B0912;-webkit-overflow-scrolling:touch}.kp-wrap canvas{display:block;width:calc(100% * var(--z,1));height:auto}`;
document.head.appendChild(st);

window.KuPlanner = { html, encode, decode };
})();
