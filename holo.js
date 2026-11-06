/* Kit Up: hologram maps.
   Solid purple 3D tactical blockouts drawn on a canvas (no WebGL, no libraries): drag to rotate and tilt,
   pinch or scroll to zoom, top-down, auto-rotate. The geometry is in holo-maps.js and loads only when a map page opens.
   These are fan-made, hand-traced blockouts from screenshots. Heights and small props are approximate, not official map data. */
(function () {
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TRACED = new Set(['shipment', 'transit213', 'silkworm', 'cachette', 'lithium', 'lotus', 'sentry', 'coal', 'nautical', 'mumbai', 'munition', 'reactoru92']);
const keyOf = m => [norm(m.n), norm(m.id)].find(k => TRACED.has(k)) || '';
let loading = null;
function loadMaps() {
  if (window.KU_HOLO_MAPS) return Promise.resolve();
  if (!loading) loading = new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'holo-maps.js'; s.onload = ok; s.onerror = () => { loading = null; no(new Error('holo-maps')); }; document.head.appendChild(s); });
  return loading;
}

function create(canvas, M) {
let full = false; canvas.style.touchAction = 'pan-y';
let objects=M.props, buildings=M.buildings, outline=M.outline, barrels=[];
const ctx=canvas.getContext('2d');let W=0,H=0,dpr=1;
let yaw=0, tilt=.80, zoom=(M.name==='SHIPMENT'?1.08:1.13), auto=false,down=null, fingers=null, clock=0;
function resize(){let r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,1.35);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
let fitScale=1,viewCX=50,viewCZ=50;
function updateViewFit(){
let x0=1000,x1=-1000,z0=1000,z1=-1000;
for(const v of outline){let x=v[0],z=v[1];let a=x*Math.cos(yaw)-z*Math.sin(yaw),b=x*Math.sin(yaw)+z*Math.cos(yaw);if(a<x0)x0=a;if(a>x1)x1=a;if(b<z0)z0=b;if(b>z1)z1=b}
viewCX=(x0+x1)/2;viewCZ=(z0+z1)/2;
let maxH=buildings.length?Math.max(...buildings.map(v=>v.h)):11;
let visibleH=(z1-z0)*Math.sin(tilt)+maxH*Math.cos(tilt);
fitScale=Math.min(W*.87/Math.max(20,x1-x0),H*.74/Math.max(22,visibleH))*zoom;
}
function proj(x,y,z){let a=x*Math.cos(yaw)-z*Math.sin(yaw),b=x*Math.sin(yaw)+z*Math.cos(yaw);let s=fitScale;return {x:W/2+(a-viewCX)*s,y:H*.55+((b-viewCZ)*Math.sin(tilt)-y*Math.cos(tilt))*s,depth:b*Math.cos(tilt)+y*Math.sin(tilt)}}
function line(points,color,width=1,blur=0){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.stroke();ctx.shadowBlur=0}
function poly(points,fill,stroke,width=1,blur=0){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.shadowColor=stroke;ctx.shadowBlur=blur;ctx.stroke();ctx.shadowBlur=0}}
function P(x,y,z){return proj(x,y,z)}
function cube(o){
let {x,z,w,d,r,t}=o;let height=t==='car'?2.9:t==='barrier'?2.9:t==='barrel'?3.0:t==='crate'?4.3:t==='center'?10:t==='small'?5:11;
let a=r*Math.PI/180,co=Math.cos(a),si=Math.sin(a);function v(dx,dz,y){return P(x+dx*co-dz*si,y,z+dx*si+dz*co)}
let lower=[v(-w/2,-d/2,0),v(w/2,-d/2,0),v(w/2,d/2,0),v(-w/2,d/2,0)];
let upper=[v(-w/2,-d/2,height),v(w/2,-d/2,height),v(w/2,d/2,height),v(-w/2,d/2,height)];
let isCar=t==='car',isBarrier=t==='barrier',isCrate=t==='crate';
let body=isCar?'#372045':isBarrier?'#442a57':isCrate?'#43305c':'#42215e';
let roof=isCar?'#9c72b5':isBarrier?'#7f6597':isCrate?'#886b9f':'#75469c';
let edge=isCar?'#dab8ea':isBarrier?'#ae8ccf':'#c79aea';
let wallColors=['#41245a','#301b46','#482760','#38204f'];
let sides=[];for(let i=0;i<4;i++){let j=(i+1)%4;sides.push({depth:(lower[i].depth+lower[j].depth+upper[i].depth+upper[j].depth)/4,idx:i,pts:[lower[i],lower[j],upper[j],upper[i]]})}
sides.sort((a,b)=>a.depth-b.depth);for(const f of sides){poly(f.pts,wallColors[f.idx],edge,.85,1.6)}
poly(upper,roof,edge,1.25,3);
if(isCar){poly([v(-w*.34,-d*.25,height+.03),v(w*.32,-d*.25,height+.03),v(w*.32,d*.24,height+.03),v(-w*.34,d*.24,height+.03)],'#241a39','#d6adff',.8,1.8);
for(let zz of [-d*.29,d*.30]){line([v(-w*.54,zz,.45),v(-w*.54,zz,1.45)],'#21112c',3);line([v(w*.54,zz,.45),v(w*.54,zz,1.45)],'#21112c',3)}return}
if(isBarrier){line([v(-w*.38,0,height+.03),v(w*.38,0,height+.03)],'#d6bbec',.8);return}
if(isCrate){line([v(-w/2,-d/2,height+.04),v(w/2,d/2,height+.04)],'#cfaae6',.85);line([v(w/2,-d/2,height+.04),v(-w/2,d/2,height+.04)],'#cfaae6',.85);return}
// Roof ribbing identifies shipping containers while keeping a solid top surface.
let count=Math.max(3,Math.round(Math.max(w,d)/2));for(let i=1;i<count;i++){let q=-.5+i/count;if(w>d){line([v(q*w,-d/2,height+.05),v(q*w,d/2,height+.05)],'#bb94d1',.55)}else{line([v(-w/2,q*d,height+.05),v(w/2,q*d,height+.05)],'#bb94d1',.55)}}
}
function drum(o){let {x,z}=o;let top=P(x,3.7,z),bottom=P(x,0,z),rx=Math.max(1.3,2.2*zoom),ry=Math.max(1,1.3*zoom);ctx.fillStyle='#543569';ctx.strokeStyle='#c79ddf';ctx.lineWidth=1.1;ctx.beginPath();ctx.ellipse(bottom.x,bottom.y,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.stroke();line([P(x-1.1,0,z),P(x-1.1,3.7,z)],'#e69aff',1);line([P(x+1.1,0,z),P(x+1.1,3.7,z)],'#e69aff',1);ctx.beginPath();ctx.ellipse(top.x,top.y,rx,ry,0,0,Math.PI*2);ctx.fillStyle='#8a66a6';ctx.fill();ctx.stroke()}
function building(o){
let ps=o.poly,h=o.h;let top=ps.map(p=>P(p[0],h,p[1])),bottom=ps.map(p=>P(p[0],0,p[1]));
let faces=[];for(let i=0;i<ps.length;i++){let j=(i+1)%ps.length;faces.push({depth:(bottom[i].depth+bottom[j].depth+top[i].depth+top[j].depth)/4,pts:[bottom[i],bottom[j],top[j],top[i]]})}
faces.sort((a,b)=>a.depth-b.depth);faces.forEach((f,i)=>poly(f.pts,(i%2?'#321c4a':'#402657'),'#8f6ca5',.8,1.3));
poly(top,'#675080','#c8a9e1',1.25,2.3);
let cx=top.reduce((v,p)=>v+p.x,0)/top.length,cy=top.reduce((v,p)=>v+p.y,0)/top.length;
let inset=top.map(p=>({x:cx+(p.x-cx)*.81,y:cy+(p.y-cy)*.81}));line([...inset,inset[0]],'#a98dbf',.7,.5);
}
function roofmark(o){let x=o.p[0],z=o.p[1],r=o.r,h=o.h;let arr=[];for(let i=0;i<=40;i++){let angle=i*Math.PI*2/40;arr.push(P(x+Math.cos(angle)*r,h,z+Math.sin(angle)*r))}line(arr,'#d4abef',1.1,2);let cross=[P(x-r*.42,h+.02,z),P(x+r*.42,h+.02,z)];line(cross,'#c79bdf',.7,1)}
function barrel(b){let p=P(b.x,3,b.z),q=P(b.x,0,b.z);line([p,q],'#9e45d5',2,2);ctx.beginPath();ctx.ellipse(p.x,p.y,2.6*zoom,1.6*zoom,0,0,Math.PI*2);ctx.strokeStyle='#eb9cff';ctx.lineWidth=1;ctx.stroke()}
let lastFrame=0,dead=false;function render(ts){if(dead||!canvas.isConnected){dead=true;ro.disconnect();return}if(ts-lastFrame<34){requestAnimationFrame(render);return;}lastFrame=ts;if(document.hidden){requestAnimationFrame(render);return;}clock=ts*.001;if(auto)yaw+=.0027;updateViewFit();ctx.clearRect(0,0,W,H);
let halo=P(50,-4,50);let gr=ctx.createRadialGradient(halo.x,halo.y,10,halo.x,halo.y,Math.min(W,H)*.54);gr.addColorStop(0,'#8532ce40');gr.addColorStop(1,'#8532ce00');ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
// Base plate: opaque purple instead of blurred photograph.
let base=outline.map(p=>P(p[0],-4,p[1])),floor=outline.map(p=>P(p[0],0,p[1]));for(let i=0;i<base.length;i++){let j=(i+1)%base.length;poly([base[i],base[j],floor[j],floor[i]],'#20112f','#8c5aad',1,3)}poly(floor,'#21172f','#ac82c8',1.5,4);
ctx.save();ctx.beginPath();floor.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.clip();for(let i=0;i<=100;i+=5){line([P(i,.03,0),P(i,.03,100)],i%20===0?'#735e9147':'#644c802c',i%20===0?.8:.45);line([P(0,.03,i),P(100,.03,i)],i%20===0?'#735e9147':'#644c802c',i%20===0?.8:.45)}
// Detailed linework traced from the user's exact overhead map screenshot.
if(M.detail){for(const shape of M.detail){if(shape.length<2)continue;let pp=shape.map(v=>P(v[0],.09,v[1]));line(pp,'#bba1d35a',.7,.5)}}
// Animated scanner stays on the purple floor.
let scan=(clock*13)%100;line([P(0,.08,scan),P(100,.08,scan)],'#a776cb5e',.9,2);ctx.restore();
// Draw back-to-front using projected centers.
let draw=[...buildings.map(o=>({depth:P(o.poly.reduce((s,p)=>s+p[0],0)/o.poly.length,0,o.poly.reduce((s,p)=>s+p[1],0)/o.poly.length).depth,draw:()=>building(o)})),...objects.map(o=>({depth:P(o.x,0,o.z).depth,draw:()=>o.t==='barrel'?drum(o):cube(o)})),...barrels.map(b=>({depth:P(b.x,0,b.z).depth,draw:()=>barrel(b)}))];draw.sort((a,b)=>a.depth-b.depth);draw.forEach(o=>o.draw());if(M.roofmarks){for(const mark of M.roofmarks)roofmark(mark)}
poly(floor,null,'#c3a1dc',1.7,4);requestAnimationFrame(render)}requestAnimationFrame(render);
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);if(!down)down={id:e.pointerId,x:e.clientX,y:e.clientY};else fingers={id:e.pointerId,x:e.clientX,y:e.clientY,dist:Math.hypot(e.clientX-down.x,e.clientY-down.y)}});
canvas.addEventListener('pointermove',e=>{if(fingers){if(e.pointerId===fingers.id){let dist=Math.hypot(e.clientX-down.x,e.clientY-down.y);zoom=Math.max(.45,Math.min(3.2,zoom*dist/(fingers.dist||dist)));fingers={...fingers,x:e.clientX,y:e.clientY,dist}}}else if(down&&e.pointerId===down.id){yaw+=(e.clientX-down.x)*.012;if(e.pointerType!=='touch'||full)tilt=Math.max(.10,Math.min(1.55,tilt+(e.clientY-down.y)*.008));down.x=e.clientX;down.y=e.clientY}});
canvas.addEventListener('pointerup',e=>{if(fingers&&e.pointerId===fingers.id)fingers=null;if(down&&e.pointerId===down.id){down=null;fingers=null}});canvas.addEventListener('pointercancel',()=>{down=null;fingers=null});canvas.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();zoom=Math.max(.45,Math.min(3.2,zoom*(e.deltaY>0?.92:1.08)))},{passive:false});
const def = () => (M.name === 'SHIPMENT' ? 1.08 : 1.13);
return {
  iso() { tilt = .80; },
  top() { tilt = 1.55; yaw = 0; },
  spin() { auto = !auto; return auto; },
  zoomIn() { zoom = Math.min(3.2, zoom * 1.20); },
  zoomOut() { zoom = Math.max(.38, zoom / 1.20); },
  reset() { yaw = 0; tilt = .80; zoom = def(); auto = false; },
  grab() { full = !full; canvas.style.touchAction = full ? 'none' : 'pan-y'; return full; },
  stop() { dead = true; }
};
}

const inst = new WeakMap();
function html(m) {
  const k = keyOf(m); if (!k) return '';
  return `<div class="card holo" data-holo="${U.esc(m.id)}" data-holo-key="${k}">
    <div class="sec-head"><div><p class="eyebrow">Hologram</p><h3 class="h3">${U.esc(m.n)} tactical view</h3></div><span class="small muted" data-holo-meta></span></div>
    <div class="holo-view"><canvas data-holo-canvas aria-label="${U.esc(m.n)} interactive 3D hologram"></canvas><div class="holo-hint">DRAG SIDEWAYS TO ROTATE · PINCH TO ZOOM</div><div class="holo-err" data-holo-err hidden></div></div>
    <div class="holo-bar" role="group" aria-label="Hologram controls">
      <button class="chip" data-holo-act="iso" aria-pressed="true">Solid 3D</button><button class="chip" data-holo-act="top" aria-pressed="false">Top down</button><button class="chip" data-holo-act="spin" aria-pressed="false">Auto rotate</button><button class="chip" data-holo-act="grab" aria-pressed="false">Drag to tilt</button><button class="chip" data-holo-act="reset">Reset</button>
      <button class="chip holo-z" data-holo-act="zoomOut" aria-label="Zoom out">−</button><button class="chip holo-z" data-holo-act="zoomIn" aria-label="Zoom in">+</button>
    </div>
    <p class="small muted" data-holo-status></p>
    <p class="small muted">Fan-made blockout traced by hand from screenshots. Heights and small props are approximate, and it is not official map data.</p>
  </div>`;
}
function mount() {
  document.querySelectorAll('.holo canvas[data-holo-canvas]:not([data-ready])').forEach(c => {
    c.dataset.ready = '1';
    const root = c.closest('.holo'), key = root.dataset.holoKey;
    loadMaps().then(() => {
      if (!c.isConnected) return;
      const M = (window.KU_HOLO_MAPS || []).find(x => norm(x.name) === key);
      if (!M) throw new Error('no map');
      inst.set(c, create(c, M));
      const meta = root.querySelector('[data-holo-meta]'); if (meta) meta.textContent = key === 'shipment' ? `${M.props.length} objects` : `${M.buildings.length} roofs · ${M.props.length} props`;
      const st = root.querySelector('[data-holo-status]'); if (st && M.status) st.textContent = M.status.toLowerCase().replace(/^./, ch => ch.toUpperCase());
    }).catch(() => { const e = root.querySelector('[data-holo-err]'); if (e) { e.hidden = false; e.textContent = 'Could not load the hologram. Check your connection and refresh.'; } });
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-holo-act]'); if (!b) return;
  const root = b.closest('.holo'), c = root && root.querySelector('canvas'), h = c && inst.get(c); if (!h) return;
  const a = b.dataset.holoAct;
  if (a === 'iso' || a === 'top') { h[a](); root.querySelectorAll('[data-holo-act="iso"],[data-holo-act="top"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }
  else if (a === 'spin') b.setAttribute('aria-pressed', String(h.spin()));
  else if (a === 'grab') { const on = h.grab(); b.setAttribute('aria-pressed', String(on)); const t = root.querySelector('.holo-hint'); if (t) t.textContent = on ? 'DRAG TO ROTATE AND TILT · PAGE SCROLL PAUSED HERE' : 'DRAG SIDEWAYS TO ROTATE · PINCH TO ZOOM'; }
  else if (a === 'reset') { h.reset(); root.querySelectorAll('[data-holo-act]').forEach(x => { if (x.hasAttribute('aria-pressed') && x.dataset.holoAct !== 'grab') x.setAttribute('aria-pressed', String(x.dataset.holoAct === 'iso')); }); }
  else h[a]();
});
const css = document.createElement('style');
css.textContent = `.holo{display:grid;gap:10px}.holo-view{position:relative;height:min(112vw,520px);min-height:260px;border-radius:14px;overflow:hidden;border:1px solid #63318c;background:radial-gradient(ellipse at 50% 46%,#25103f 0%,#0b0616 68%,#05030a 100%)}
.holo-view canvas{width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab}.holo-hint{position:absolute;top:10px;left:50%;transform:translateX(-50%);max-width:calc(100% - 20px);font-size:10px;letter-spacing:.08em;color:#d4b4ec;background:#180b2bbb;border:1px solid #63318c;padding:7px 12px;border-radius:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.holo-err{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;color:#f6edff}.holo-bar{display:flex;flex-wrap:wrap;gap:8px}.holo-bar .chip{min-height:44px}.holo-z{min-width:52px;font-size:1.3rem}`;
document.head.appendChild(css);
const v = document.getElementById('view');
if (v) new MutationObserver(() => mount()).observe(v, { childList: true, subtree: true });
window.KuHolo = { html, mount };
})();
