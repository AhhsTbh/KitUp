/* Kit Up: hologram map viewer.
   A stylized 3D view of the official map image: drag to rotate and tilt, pinch or scroll to zoom, switch to Pan,
   or switch to Mark and tap the map to drop landing, rotation, regroup and fight markers.
   It only tilts and lights the real image. No buildings, cover or terrain are drawn or invented. */
(function () {
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const MARKS = { land: ['▼', 'Land', '#3DDC97'], rot: ['➜', 'Rotate', '#F2B726'], regroup: ['◆', 'Regroup', '#B79CFF'], fight: ['✖', 'Fight', '#FF5A5F'] };
const H = { id: null, mode: 'rotate', mark: 'land', rz: 0, rx: 48, zoom: 1, px: 0, py: 0, layout: false, marks: [] };
const key = id => 'ku.holo.' + id;
const find = id => { for (const p of (S.maps && S.maps.playlists) || []) { const m = p.maps.find(x => x.id === id); if (m) return m; } return null; };
const load = id => { try { const a = JSON.parse(localStorage.getItem(key(id)) || '[]'); return Array.isArray(a) ? a.filter(x => MARKS[x.k] && x.x >= 0 && x.x <= 1 && x.y >= 0 && x.y <= 1).slice(0, 60) : []; } catch (e) { return []; } };
const save = () => { try { localStorage.setItem(key(H.id), JSON.stringify(H.marks)); return true; } catch (e) { return false; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function html(m) {
  if (!m || !m.img) return '';
  if (H.id !== m.id) { Object.assign(H, { id: m.id, rz: 0, rx: 48, zoom: 1, px: 0, py: 0, layout: !!m.layout, mode: 'rotate' }); H.marks = load(m.id); }
  return `<div class="card holo" data-holo="${U.esc(m.id)}">
    <div class="sec-head"><div><p class="eyebrow">Hologram</p><h3 class="h3">${U.esc(m.n)} tactical view</h3></div><span class="small muted" data-holo-count></span></div>
    <div class="holo-stage" data-holo-stage><div class="holo-floor"></div><div class="holo-world" data-holo-world>
      <div class="holo-plane" data-holo-plane><img class="holo-img" data-holo-img src="${U.esc(m.img)}" alt="${U.esc(m.n)} hologram" draggable="false">
        <img class="holo-ghost" data-holo-ghost src="${U.esc(m.img)}" alt="" aria-hidden="true" draggable="false"><span class="holo-scan"></span><span class="holo-edge"></span><div class="holo-marks" data-holo-marks></div></div></div></div>
    <div class="holo-bar" role="group" aria-label="Hologram controls">
      ${[['rotate', 'Rotate'], ['pan', 'Pan'], ['mark', 'Mark']].map(([k, l]) => `<button class="chip" data-holo-mode="${k}" aria-pressed="${H.mode === k}">${l}</button>`).join('')}
      <button class="chip" data-holo-act="top">Top-down</button><button class="chip" data-holo-act="reset">Reset</button>${m.layout ? `<button class="chip" data-holo-act="layout" aria-pressed="${H.layout}">Overhead</button>` : ''}
    </div>
    <div class="holo-bar" data-holo-markbar role="group" aria-label="Marker type" ${H.mode === 'mark' ? '' : 'hidden'}>
      ${Object.entries(MARKS).map(([k, [g, l]]) => `<button class="chip" data-holo-mark="${k}" aria-pressed="${H.mark === k}">${g} ${l}</button>`).join('')}<button class="chip" data-holo-act="clear">Clear all</button>
    </div>
    <p class="small muted" data-holo-help></p>
    <p class="small muted">A stylized view of the official map image (the overhead layout where one exists, otherwise a photo of the map). It does not show real building or cover geometry. Markers are your own notes, saved on this device.</p>
  </div>`;
}

const HELP = { rotate: 'Drag to spin and tilt. Pinch or scroll to zoom.', pan: 'Drag to slide the map. Pinch or scroll to zoom.', mark: 'Tap the map to drop a marker. Tap a marker to remove it.' };

function apply(root) {
  const w = root.querySelector('[data-holo-world]'); if (!w) return;
  w.style.transform = `translate(-50%,-50%) translate(${H.px}px,${H.py}px) scale(${H.zoom}) rotateX(${H.rx}deg) rotateZ(${H.rz}deg)`;
  const marks = root.querySelector('[data-holo-marks]');
  marks.innerHTML = H.marks.map((p, i) => { const [g, l, c] = MARKS[p.k]; return `<button class="holo-mk" data-holo-del="${i}" style="left:${p.x * 100}%;top:${p.y * 100}%;--c:${c};transform:translate(-50%,-50%) rotateZ(${-H.rz}deg) rotateX(${-H.rx}deg)" aria-label="${l} marker, tap to remove"><i>${g}</i></button>`; }).join('');
  const n = root.querySelector('[data-holo-count]'); if (n) n.textContent = H.marks.length ? `${H.marks.length} marker${H.marks.length === 1 ? '' : 's'}` : '';
  const hp = root.querySelector('[data-holo-help]'); if (hp) hp.textContent = HELP[H.mode];
  root.querySelector('[data-holo-stage]').classList.toggle('mark', H.mode === 'mark');
}
function swapImage(root) {
  const m = find(H.id); if (!m) return; const src = H.layout && m.layout ? m.layout : m.img;
  const w = root.querySelector('[data-holo-world]');
  root.querySelectorAll('[data-holo-img],[data-holo-ghost]').forEach(i => { i.src = src; });
  const im = root.querySelector('[data-holo-img]'); const fit = () => { if (im.naturalWidth) w.style.aspectRatio = im.naturalWidth + '/' + im.naturalHeight; }; im.onload = fit; fit();
}
function mount() {
  const root = document.querySelector('.holo[data-holo]'); if (!root || root.dataset.ready) return;
  root.dataset.ready = '1'; swapImage(root); apply(root);
  const stage = root.querySelector('[data-holo-stage]'), plane = root.querySelector('[data-holo-plane]');
  const pts = new Map(); let last = null, dist = 0, moved = 0;
  stage.addEventListener('pointerdown', e => { if (H.mode !== 'mark' && !(e.target.closest && e.target.closest('[data-holo-del]'))) stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; dist = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dist) H.zoom = clamp(H.zoom * d / dist, .6, 4); dist = d; moved += 9; apply(root); return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
    if (H.mode === 'rotate') { H.rz += dx * .45; H.rx = clamp(H.rx - dy * .35, 0, 80); } else if (H.mode === 'pan') { H.px += dx; H.py += dy; }
    apply(root);
  });
  const up = e => {
    const was = pts.size; pts.delete(e.pointerId); if (pts.size < 2) dist = 0; if (pts.size === 1) last = [...pts.values()][0];
    // Mark mode: the plane receives the tap itself, so offsetX/offsetY are already in the map's own flat coordinates
    if (was === 1 && moved <= 6 && H.mode === 'mark' && e.target === plane) place(root, e.offsetX / plane.offsetWidth, e.offsetY / plane.offsetHeight);
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', e => { pts.delete(e.pointerId); dist = 0; });
  stage.addEventListener('wheel', e => { e.preventDefault(); H.zoom = clamp(H.zoom * (e.deltaY < 0 ? 1.1 : .9), .6, 4); apply(root); }, { passive: false });
}
function place(root, x, y) {
  if (H.marks.length >= 60) { U.toast && U.toast('Marker limit reached. Clear some first.'); return; }
  H.marks.push({ k: H.mark, x: Math.round(clamp(x, 0, 1) * 1000) / 1000, y: Math.round(clamp(y, 0, 1) * 1000) / 1000 });
  if (!save() && U.toast) U.toast("This browser won't save markers.");
  apply(root);
}
document.addEventListener('click', e => {
  const root = e.target.closest && e.target.closest('.holo'); if (!root) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.holoMode) { H.mode = b.dataset.holoMode; root.querySelectorAll('[data-holo-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); root.querySelector('[data-holo-markbar]').hidden = H.mode !== 'mark'; apply(root); }
  else if (b.dataset.holoMark) { H.mark = b.dataset.holoMark; root.querySelectorAll('[data-holo-mark]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
  else if (b.dataset.holoDel != null) { H.marks.splice(Number(b.dataset.holoDel), 1); save(); apply(root); }
  else if (b.dataset.holoAct === 'top') { H.rx = 0; H.rz = 0; apply(root); }
  else if (b.dataset.holoAct === 'reset') { Object.assign(H, { rz: 0, rx: 48, zoom: 1, px: 0, py: 0 }); apply(root); }
  else if (b.dataset.holoAct === 'layout') { H.layout = !H.layout; b.setAttribute('aria-pressed', String(H.layout)); swapImage(root); }
  else if (b.dataset.holoAct === 'clear') { if (H.marks.length && confirm('Remove all markers on this map?')) { H.marks = []; save(); apply(root); } }
});
const css = document.createElement('style');
css.textContent = `.holo{display:grid;gap:10px}.holo-stage{position:relative;height:min(86vw,440px);overflow:hidden;border-radius:14px;background:radial-gradient(ellipse at 50% 85%,#2b1c63 0%,#0b0818 70%);border:1px solid var(--accent);box-shadow:0 0 24px #9B7BFF33 inset;perspective:900px;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}.holo-stage.mark{cursor:crosshair}.holo-stage.mark .holo-plane{pointer-events:auto}
.holo-floor{position:absolute;inset:auto -20% -10% -20%;height:55%;background:repeating-linear-gradient(90deg,#9B7BFF22 0 1px,transparent 1px 38px),repeating-linear-gradient(0deg,#9B7BFF22 0 1px,transparent 1px 38px);transform:rotateX(70deg);transform-origin:bottom;mask-image:linear-gradient(transparent,#000);-webkit-mask-image:linear-gradient(transparent,#000);pointer-events:none}
.holo-world{position:absolute;left:50%;top:50%;width:min(94%,620px);aspect-ratio:16/9;transform-style:preserve-3d;will-change:transform}
.holo-plane{position:absolute;inset:0;transform-style:preserve-3d;border-radius:4px}.holo-plane>*{pointer-events:none}.holo-plane .holo-marks,.holo-plane .holo-mk{pointer-events:auto}.holo-marks{position:absolute;inset:0;transform-style:preserve-3d;transform:translateZ(34px);pointer-events:none!important}
.holo-img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;image-rendering:auto;filter:saturate(.5) contrast(1.15) brightness(.85) hue-rotate(235deg);mix-blend-mode:screen;opacity:.92;border-radius:4px}
.holo-ghost{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(1px) saturate(.3) hue-rotate(235deg) brightness(1.2);opacity:.28;transform:translateZ(22px);border-radius:4px}
.holo-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,#00000000 0 2px,#9B7BFF26 2px 3px);mix-blend-mode:screen;border-radius:4px}.holo-edge{position:absolute;inset:0;border:1px solid #B49DFFaa;box-shadow:0 0 18px #9B7BFF99,0 0 2px #fff6 inset;border-radius:4px}
.holo-mk{position:absolute;width:44px;height:44px;border:0;background:none;padding:0;display:grid;place-items:center;transform-style:preserve-3d}.holo-mk i{font-style:normal;font-size:20px;line-height:1;color:var(--c);text-shadow:0 0 8px var(--c),0 0 16px var(--c);filter:drop-shadow(0 0 4px var(--c))}.holo-mk::after{content:"";position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:1px solid var(--c);border-radius:50%;opacity:.55}
.holo-bar{display:flex;flex-wrap:wrap;gap:8px}.holo-bar .chip{min-height:44px}
@media (prefers-reduced-motion:no-preference){.holo-scan{animation:holoscan 6s linear infinite}.holo-edge{animation:holoflick 4s ease-in-out infinite}.holo-mk::after{animation:holoping 2s ease-out infinite}}
@keyframes holoscan{to{background-position:0 60px}}@keyframes holoflick{0%,100%{opacity:1}50%{opacity:.78}}@keyframes holoping{from{transform:scale(.6);opacity:.7}to{transform:scale(1.5);opacity:0}}`;
document.head.appendChild(css);
// mount whenever a map page is drawn
const v = document.getElementById('view');
if (v) new MutationObserver(() => mount()).observe(v, { childList: true, subtree: true });
window.KuHolo = { html, mount };
})();
