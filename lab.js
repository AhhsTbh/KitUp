/* Kit Up Lab: TTK curves, versatility score, patch solver, recoil compare. Uses data/game.json live stats. */
(function(){
const R=[15,40,80,100],COL=['#9B7BFF','#3DDC97','#F2B726'],HP=100;
const L={sel:[0,1,2],blend:50,patch:'Han 86 | fire rate | 740 -> 700\nHan 86 | damage | 30 -> 28',a:0,b:1,shots:30,res:null};
const ws=()=>S.g.weapons.filter(w=>w.live&&w.live.ttk15);
const tt=w=>R.map(r=>w.live['ttk'+r]);
const stk=(w,t)=>Math.round(t*w.live.rpm/60000)+1;
const at=(t,r)=>{if(r<=15)return t[0];for(let i=1;i<4;i++)if(r<=R[i])return t[i-1]+(t[i]-t[i-1])*(r-R[i-1])/(R[i]-R[i-1]);return t[3]};
const WM=[[.5,.35,.15,0],[.1,.25,.35,.3]];
const vs=(t,k)=>WM[k].reduce((a,w,i)=>a+w*1000/t[i],0);
function table(m){const mx=[0,1].map(k=>Math.max(...[...m.values()].map(t=>vs(t,k))));
return [...m].map(([w,t])=>{const a=vs(t,0)/mx[0]*100,b=vs(t,1)/mx[1]*100;return{w,mp:a,dz:b,v:a*(100-L.blend)/100+b*L.blend/100}}).sort((x,y)=>y.v-x.v)}
function chart(list){const W=340,H=210,p=34,mx=Math.max(...list.flatMap(w=>tt(w)))*1.1;
const X=r=>p+r/100*(W-p-8),Y=t=>H-22-t/mx*(H-34);let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:12px">`;
for(let r=0;r<=100;r+=20)s+=`<line x1="${X(r)}" x2="${X(r)}" y1="8" y2="${H-22}" stroke="var(--line)"/><text x="${X(r)-8}" y="${H-8}" font-size="9" fill="var(--muted)">${r}m</text>`;
for(let i=0;i<5;i++){const t=mx*i/4;s+=`<line x1="${p}" x2="${W-8}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="2" y="${Y(t)+3}" font-size="9" fill="var(--muted)">${Math.round(t)}</text>`}
list.forEach((w,i)=>{const t=tt(w);let d='';for(let r=0;r<=100;r+=2)d+=(r?'L':'M')+X(r)+' '+Y(at(t,r));s+=`<path d="${d}" fill="none" stroke="${COL[i]}" stroke-width="2.2"/>`;t.forEach((v,j)=>s+=`<circle cx="${X(R[j])}" cy="${Y(v)}" r="3.5" fill="${COL[i]}"/>`)});return s+'</svg>'}
function rec(a,b){const rows=[['Horizontal recoil','hRecoil'],['Vertical recoil','vRecoil'],['Kick','kick']],mx=Math.max(...rows.flatMap(([,k])=>[a.live[k],b.live[k]]))||1;
return rows.map(([n,k])=>`<div class="lab-s" style="margin-top:6px">${n}</div>`+[a,b].map((w,i)=>`<div style="display:flex;align-items:center;gap:8px"><i style="display:block;height:10px;border-radius:5px;width:${Math.max(2,w.live[k]/mx*70)}%;background:${COL[i]}"></i><span class="lab-s">${w.name} ${w.live[k]}</span></div>`).join('')).join('')}
function solve(){const m=new Map(ws().map(w=>[w,tt(w)])),before=table(m).map(r=>r.w.id),b0=new Map([...m].map(([w,t])=>[w.id,table(new Map([[w,t]]))[0].v]));
const log=[],P=new Map([...m].map(([w,t])=>[w,t.slice()])),rpm=new Map(ws().map(w=>[w,w.live.rpm]));
L.patch.split('\n').forEach(l=>{const x=l.match(/^\s*(.+?)\s*\|\s*(.+?)\s*\|\s*([\d.]+)\s*(?:->|→|to)\s*([\d.]+)/i);if(!x)return log.push(['✗',l,'could not parse, goes to review']);
const w=ws().find(g=>g.name.toLowerCase()==x[1].trim().toLowerCase());if(!w)return log.push(['✗',l,'unknown weapon']);const f=x[2].toLowerCase(),o=+x[3],n=+x[4],t=P.get(w),k=t.map(v=>stk(w,v));
if(/fire rate|rpm/.test(f)){P.set(w,k.map(q=>Math.round((q-1)*60000/n)));rpm.set(w,n);log.push(['✓',l,'TTK recomputed from new RPM'])}
else if(/^damage|max damage/.test(f)){P.set(w,k.map(q=>Math.round((Math.max(1,Math.ceil(q*o/n-.001))-1)*60000/rpm.get(w))));log.push(['✓',l,'estimate: shots-to-kill rescaled by damage ratio'])}
else log.push(['⚠',l,'needs lab re-measurement (not modeled)'])});
const after=table(P);L.res={log,rows:after.map((r,i)=>({n:r.w.name,v:r.v,d:before.indexOf(r.w.id)-i}))}}
function sel(k,v){return `<select data-lab="${k}" class="lab-i">${ws().map((w,i)=>`<option value="${i}" ${i==v?'selected':''}>${w.name}</option>`).join('')}</select>`}
window.renderLab=function(){const W=ws(),list=L.sel.map(i=>W[i]),m=new Map(W.map(w=>[w,tt(w)])),T=table(m).slice(0,10);
return `<section class="sec"><div class="sec-head"><h2 class="h">Lab</h2></div>${window.kuBanner()}<p class="lab-s">Built from each gun’s measured stat bars. Every number is a measurement, not an opinion.</p>
<div class="lab-c"><h3>TTK vs range (ms)</h3><div class="lab-r">${L.sel.map((v,i)=>sel('s'+i,v)).join('')}</div>${chart(list)}<button class="btn" data-lab="share">Share card</button>
<table class="lab-t"><tr><th></th>${R.map(r=>`<th>${r}m</th>`).join('')}</tr>${list.map((w,i)=>`<tr><td style="color:${COL[i]}">${w.name}</td>${tt(w).map(t=>`<td>${t} <span class="lab-s">${stk(w,t)}stk</span></td>`).join('')}</tr>`).join('')}</table></div>
<div class="lab-c"><h3>Versatility score</h3><div class="lab-s">Close-range weighted for Multiplayer, long-range weighted for DMZ. Blend: ${100-L.blend}% MP / ${L.blend}% DMZ</div><input type="range" data-lab="blend" min="0" max="100" value="${L.blend}" class="lab-i">
<table class="lab-t"><tr><th>#</th><th>Gun</th><th>MP</th><th>DMZ</th><th>V</th></tr>${T.map((r,i)=>`<tr><td>${i+1}</td><td>${r.w.name}</td><td>${r.mp.toFixed(0)}</td><td>${r.dz.toFixed(0)}</td><td><b>${r.v.toFixed(1)}</b></td></tr>`).join('')}</table></div>
<div class="lab-c"><h3>Patch-note solver</h3><div class="lab-s">One change per line: Gun | field | old -> new. Fire rate changes are exact. Damage changes are estimates (shots-to-kill rescaled by the damage ratio). Anything else is flagged for re-measurement.</div><textarea data-lab="patch" class="lab-i" rows="4">${L.patch}</textarea><button class="btn" data-lab="apply">Apply patch</button>
${L.res?`<div class="lab-s" style="margin-top:8px">${L.res.log.map(x=>x.join(' ')).join('<br>')}</div><table class="lab-t"><tr><th>#</th><th>Gun</th><th>V</th><th>Δ rank</th></tr>${L.res.rows.slice(0,10).map((r,i)=>`<tr><td>${i+1}</td><td>${r.n}</td><td>${r.v.toFixed(1)}</td><td>${r.d>0?'▲'+r.d:r.d<0?'▼'+-r.d:'–'}</td></tr>`).join('')}</table>`:''}</div>
<div class="lab-c"><h3>Recoil compare</h3><div class="lab-r">${sel('a',L.a)}${sel('b',L.b)}</div>${rec(W[L.a],W[L.b])}<div class="lab-s" style="margin-top:8px">Measured recoil stats from the game. Per-shot recoil patterns need captured footage, so none are drawn here.</div></div></section>`};
const st=document.createElement('style');st.textContent='.lab-c{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0}.lab-c h3{margin:0 0 8px;font-size:15px}.lab-s{font-size:12px;color:var(--muted)}.lab-r{display:flex;gap:6px;margin-bottom:8px}.lab-i{width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;margin:6px 0}.lab-t{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}.lab-t td,.lab-t th{padding:5px 3px;border-bottom:1px solid var(--line);text-align:left}';document.head.appendChild(st);
const re=()=>{const y=scrollY;go('lab');scrollTo(0,y)};
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.lab;if(!k)return;if(k=='patch'){L.patch=e.target.value;return}
if(k=='blend'){L.blend=+e.target.value}else if(k=='shots'){L.shots=+e.target.value}else if(k=='a'||k=='b'){L[k]=+e.target.value}else if(k[0]=='s'&&k.length==2){L.sel[+k[1]]=+e.target.value}else return;re()});
document.addEventListener('click',e=>{const k=e.target.dataset&&e.target.dataset.lab;if(k=='apply'){solve();re()}if(k=='share')card()});
/* Growth: Discord invite banner + shareable Lab cards. Set INVITE to your permanent server invite. */
const INVITE='https://discord.gg/2qPdNCwaHn',ON=!/REPLACE_ME/.test(INVITE);
window.kuBanner=()=>ON?`<a class="lab-b" href="${INVITE}" target="_blank" rel="noopener"><b>Find your squad</b><span>Xbox, PC and PlayStation players in one Discord. Join KitUp N Lounge →</span></a>`:'';
const bs=document.createElement('style');bs.textContent='.lab-b{display:block;text-decoration:none;color:var(--ink);background:linear-gradient(135deg,rgba(155,123,255,.28),rgba(155,123,255,.06));border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0}.lab-b b{display:block;font-size:15px;color:#C9B8FF}.lab-b span{font-size:13px;color:var(--muted)}';document.head.appendChild(bs);
const rh=window.renderHome;if(rh)window.renderHome=function(){return rh().replace('<div class="stack">','<div class="stack">'+window.kuBanner())};
async function card(){const list=L.sel.map(i=>ws()[i]),c=document.createElement('canvas');c.width=1080;c.height=1350;const g=c.getContext('2d');
g.fillStyle='#0b0714';g.fillRect(0,0,1080,1350);g.strokeStyle='#241b48';for(let x=0;x<=1080;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,1350);g.stroke()}for(let y=0;y<=1350;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(1080,y);g.stroke()}
g.fillStyle='#C9B8FF';g.font='bold 64px system-ui';g.fillText('TTK COMPARE',70,120);g.fillStyle='#8f86b3';g.font='30px system-ui';g.fillText('Measured time-to-kill, 15m to 100m',70,170);
const mx=Math.max(...list.flatMap(tt))*1.1,X=r=>90+r/100*880,Y=t=>900-t/mx*600;g.strokeStyle='#2a2150';g.fillStyle='#8f86b3';g.font='24px system-ui';for(let r=0;r<=100;r+=20){g.beginPath();g.moveTo(X(r),300);g.lineTo(X(r),900);g.stroke();g.fillText(r+'m',X(r)-18,935)}
list.forEach((w,i)=>{const t=tt(w);g.strokeStyle=g.fillStyle=COL[i];g.lineWidth=6;g.beginPath();for(let r=0;r<=100;r+=2){const x=X(r),y=Y(at(t,r));r?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();t.forEach((v,j)=>{g.beginPath();g.arc(X(R[j]),Y(v),10,0,7);g.fill()});
g.font='bold 34px system-ui';g.fillText(w.name,70,1010+i*70);g.font='30px system-ui';g.fillText(t.map(v=>v+'ms').join('   '),330,1010+i*70)});
g.fillStyle='#C9B8FF';g.font='bold 44px system-ui';g.fillText('KIT UP',70,1280);g.fillStyle='#8f86b3';g.font='28px system-ui';g.fillText(ON?'Squad finder for Xbox, PC and PlayStation · '+INVITE.replace('https://',''):'Call of Duty: Modern Warfare 4 companion',70,1322);
c.toBlob(async b=>{const f=new File([b],'kitup-ttk.png',{type:'image/png'});try{if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}catch(e){return}const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='kitup-ttk.png';a.click()})}
})();
