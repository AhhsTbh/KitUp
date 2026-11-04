/* Kit Up web LFG: accounts, squads, join requests and party chat on Supabase. Row-level security does the real protecting. */
(function(){
const URL='https://xezddmyfrtpdmhkproya.supabase.co',KEY='sb_publishable_h-0-0zYz9QFv_mdOUOyFLA_Ql8G_pES',LIB='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const MODES={multiplayer:'Multiplayer',dmz:'DMZ',warzone:'Warzone'},PL={pc:'PC',ps:'PlayStation',xbox:'Xbox'};
const W={tab:'discord',sb:null,user:null,prof:null,posts:[],mine:[],reqs:[],chat:null,msgs:[],draft:'',err:'',note:'',st:'idle'};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const redraw=()=>{if(typeof S!=='undefined'&&S.view==='squad'&&typeof go==='function'){const y=scrollY;const a=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.lw;go('squad');if(a==='draft'){const el=document.querySelector('[data-lw=draft]');el&&el.focus()}scrollTo(0,y)}};
const nice=e=>(e&&e.message||'Something went wrong').replace(/^.*?exception:?\s*/i,'');
function lib(){return new Promise((ok,no)=>{if(window.supabase)return ok();const s=document.createElement('script');s.src=LIB;s.onload=ok;s.onerror=()=>no(new Error('Could not load the sign-in service'));document.head.appendChild(s)})}
async function init(){if(W.st!=='idle')return;W.st='loading';try{await lib();W.sb=window.supabase.createClient(URL,KEY);const{data}=await W.sb.auth.getSession();W.user=data.session&&data.session.user||null;
W.sb.auth.onAuthStateChange((_e,s)=>{W.user=s&&s.user||null;load()});
W.sb.channel('kitup-lfg').on('postgres_changes',{event:'*',schema:'public',table:'lfg_posts'},()=>load(true)).on('postgres_changes',{event:'*',schema:'public',table:'lfg_members'},()=>load(true)).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},()=>{if(W.chat)loadMsgs()}).subscribe();
W.st='ready';await load()}catch(e){W.st='error';W.err=nice(e);redraw()}}
async function load(quiet){const sb=W.sb;if(!sb)return;if(!W.user){W.prof=null;W.posts=[];W.mine=[];W.reqs=[];return redraw()}
try{const uid=W.user.id;W.prof=(await sb.from('profiles').select('*').eq('id',uid).maybeSingle()).data;
if(W.prof){const sel='*, profiles!host(display_name,platform)';
W.posts=(await sb.from('lfg_posts').select(sel).eq('status','open').neq('host',uid).order('created_at',{ascending:false}).limit(30)).data||[];
const mem=(await sb.from('lfg_members').select('post_id,status').eq('user_id',uid)).data||[];const st=Object.fromEntries(mem.map(m=>[m.post_id,m.status]));
const ids=mem.map(m=>m.post_id);const f=ids.length?`host.eq.${uid},id.in.(${ids.join(',')})`:`host.eq.${uid}`;
W.mine=((await sb.from('lfg_posts').select(sel).or(f).neq('status','closed').order('created_at',{ascending:false})).data||[]).map(p=>({...p,my:p.host===uid?'host':st[p.id]}));
const hosted=W.mine.filter(p=>p.host===uid).map(p=>p.id);
W.reqs=hosted.length?((await sb.from('lfg_members').select('post_id,user_id,profiles!user_id(display_name,platform)').in('post_id',hosted).eq('status','pending')).data||[]):[];
W.posts.forEach(p=>p.my=st[p.id])}}catch(e){W.err=nice(e)}redraw()}
async function loadMsgs(){if(!W.chat)return;const r=await W.sb.from('messages').select('id,sender,body,created_at,profiles!sender(display_name)').eq('post_id',W.chat).order('created_at',{ascending:true}).limit(100);W.msgs=r.data||[];redraw()}
const val=n=>{const e=document.querySelector(`[data-f=${n}]`);return e?e.value.trim():''};
const A={
async signin(){const r=await W.sb.auth.signInWithPassword({email:val('email'),password:val('pw')});if(r.error)throw r.error},
async signup(){const r=await W.sb.auth.signUp({email:val('email'),password:val('pw')});if(r.error)throw r.error;if(!r.data.session)W.note='Check your email to confirm your account, then sign in.'},
async signout(){await W.sb.auth.signOut()},
async saveprof(){const r=await W.sb.from('profiles').upsert({id:W.user.id,display_name:val('name'),platform:val('plat'),mic:val('mic')==='1'});if(r.error)throw r.error},
async create(){const r=await W.sb.from('lfg_posts').insert({host:W.user.id,mode:val('mode'),slots:+val('slots'),note:val('note')||null,mic:W.prof.mic});if(r.error)throw r.error},
async join(id){const r=await W.sb.rpc('request_join',{p:id});if(r.error)throw r.error},
async accept(id,u){const r=await W.sb.rpc('respond_join',{p:id,u,accept:true});if(r.error)throw r.error},
async decline(id,u){const r=await W.sb.rpc('respond_join',{p:id,u,accept:false});if(r.error)throw r.error},
async leave(id){const r=await W.sb.rpc('leave_squad',{p:id});if(r.error)throw r.error;if(W.chat===id)W.chat=null},
async closesq(id){const r=await W.sb.from('lfg_posts').update({status:'closed'}).eq('id',id);if(r.error)throw r.error},
async chat(id){W.chat=W.chat===id?null:id;W.msgs=[];if(W.chat)await loadMsgs()},
async send(id){const b=W.draft.trim();if(!b)return;const r=await W.sb.from('messages').insert({post_id:id,sender:W.user.id,body:b.slice(0,500)});if(r.error)throw r.error;W.draft='';await loadMsgs()},
async block(_i,u){const r=await W.sb.from('blocks').insert({blocker:W.user.id,blocked:u});if(r.error)throw r.error;W.note='User blocked.'},
async report(id,u){const why=(window.prompt('What happened? (a few words)')||'').trim();if(why.length<3)return;const r=await W.sb.from('reports').insert({reporter:W.user.id,post_id:id,target:u,reason:why});if(r.error)throw r.error;W.note='Report sent. Thank you.'}};
document.addEventListener('click',async e=>{const t=e.target.closest&&e.target.closest('[data-lw]');if(!t)return;const k=t.dataset.lw;if(t.tagName==='A')e.preventDefault();
if(k==='tab-app'||k==='tab-discord'){W.tab=k==='tab-app'?'app':'discord';if(W.tab==='app')init();return redraw()}
if(!A[k]||!W.sb)return;W.err='';W.note='';try{await A[k](t.dataset.id,t.dataset.u);await load()}catch(x){W.err=nice(x);redraw()}});
document.addEventListener('input',e=>{if(e.target.dataset&&e.target.dataset.lw==='draft')W.draft=e.target.value});
const post=(p,mine)=>{const who=p.profiles?`${esc(p.profiles.display_name)} · ${esc(PL[p.profiles.platform]||'')}`:'';const open=p.status==='open';
const acts=mine?(p.my==='host'?`<button class="btn" data-lw="chat" data-id="${p.id}">Chat</button> <button class="btn" data-lw="closesq" data-id="${p.id}">Close</button>`:p.my==='accepted'?`<button class="btn" data-lw="chat" data-id="${p.id}">Chat</button> <button class="btn" data-lw="leave" data-id="${p.id}">Leave</button>`:`<span class="lab-s">Request sent</span> <button class="btn" data-lw="leave" data-id="${p.id}">Cancel</button>`)
:(p.my==='pending'?'<span class="lab-s">Request sent</span>':`<button class="btn" data-lw="join" data-id="${p.id}">Request to join</button> <button class="btn" data-lw="report" data-id="${p.id}" data-u="${p.host}">Report</button>`);
const reqs=p.my==='host'?W.reqs.filter(r=>r.post_id===p.id).map(r=>`<div class="lab-s" style="margin-top:6px">${esc(r.profiles&&r.profiles.display_name)} wants to join <button class="btn" data-lw="accept" data-id="${p.id}" data-u="${r.user_id}">Accept</button> <button class="btn" data-lw="decline" data-id="${p.id}" data-u="${r.user_id}">Decline</button> <button class="btn" data-lw="block" data-u="${r.user_id}">Block</button></div>`).join(''):'';
const chat=W.chat===p.id?`<div class="lab-c" style="margin:8px 0 0">${W.msgs.map(m=>`<div class="lab-s"><b>${esc(m.profiles&&m.profiles.display_name)}</b> ${esc(m.body)}</div>`).join('')||'<div class="lab-s">No messages yet.</div>'}<div class="lab-r" style="margin-top:8px"><input class="lab-i" data-lw="draft" maxlength="500" value="${esc(W.draft)}" placeholder="Message your squad"><button class="btn" data-lw="send" data-id="${p.id}">Send</button></div></div>`:'';
return `<div class="lab-c"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(MODES[p.mode])}</b><span class="lab-s">${p.filled}/${p.slots} players · ${p.status==='full'?'full':'open'}</span></div><div class="lab-s">${who}${p.mic?' · mic on':''}</div>${p.note?`<div style="margin:6px 0">${esc(p.note)}</div>`:''}${acts}${reqs}${chat}</div>`};
function panel(){if(W.st==='error')return `<div class="lab-c lab-s">${esc(W.err)}</div>`;if(W.st!=='ready')return '<div class="lab-c lab-s">Loading…</div>';
const msg=(W.err?`<div class="lab-c" style="color:#ff8a9b">${esc(W.err)}</div>`:'')+(W.note?`<div class="lab-c lab-s">${esc(W.note)}</div>`:'');
if(!W.user)return msg+`<div class="lab-c"><h3>Sign in to find a squad</h3><input class="lab-i" data-f="email" type="email" placeholder="Email" autocomplete="email"><input class="lab-i" data-f="pw" type="password" placeholder="Password (8+ characters)" autocomplete="current-password"><button class="btn" data-lw="signin">Sign in</button> <button class="btn" data-lw="signup">Create account</button></div>`;
if(!W.prof)return msg+`<div class="lab-c"><h3>Set up your profile</h3><input class="lab-i" data-f="name" maxlength="24" placeholder="Display name (2-24 characters)"><select class="lab-i" data-f="plat">${Object.entries(PL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select class="lab-i" data-f="mic"><option value="1">I use a mic</option><option value="0">No mic</option></select><button class="btn" data-lw="saveprof">Save profile</button></div>`;
return msg+`<div class="lab-c"><h3>Start a squad</h3><div class="lab-r"><select class="lab-i" data-f="mode">${Object.entries(MODES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select class="lab-i" data-f="slots">${[2,3,4,5,6].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n} players</option>`).join('')}</select></div><input class="lab-i" data-f="note" maxlength="100" placeholder="Note (optional, 100 characters)"><button class="btn" data-lw="create">Post squad</button></div>`
+(W.mine.length?`<h3 style="margin:14px 0 0">My squads</h3>${W.mine.map(p=>post(p,true)).join('')}`:'')
+`<h3 style="margin:14px 0 0">Open squads</h3>${W.posts.map(p=>post(p,false)).join('')||'<div class="lab-c lab-s">No open squads yet. Start one above.</div>'}<div class="lab-s" style="margin:12px 0">Signed in as ${esc(W.prof.display_name)}. <a href="#" data-lw="signout">Sign out</a></div>`}
const orig=window.renderSquad;
window.renderSquad=function(){const tabs=`<div class="lab-r"><button class="btn" data-lw="tab-discord">Discord squads</button><button class="btn" data-lw="tab-app">In-app squads</button></div>`;
if(W.tab!=='app')return orig().replace('</div><p class="lab-s">','</div>'+tabs+'<p class="lab-s">');
return `<section class="sec"><div class="sec-head"><h2 class="h">Squad finder</h2></div>${tabs}<p class="lab-s">Post a squad, request to join, and chat with your party. Your email is never shown to other players.</p>${panel()}</section>`};
window.__lw={W,esc,post,panel,A};
})();
