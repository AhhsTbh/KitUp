/* KitUp LIVE LFG v1.0 | Requires Supabase Auth + migration in supabase/schema.sql.
   This code does NOT fake public squads, online chat, or game invites.
   Safe publishable key only. Never embed a service_role/secret key here. */
(function(){
'use strict';
const cfg=window.KITUP_LFG_CONFIG||{};
const LIBSRC='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const L={client:null,user:null,profile:null,loading:false,loaded:false,online:false,
       error:'',message:'',busy:false,groups:[],requests:[],members:[],profiles:{},
       filterMode:'All',filterRegion:'All',filterMic:'All',query:'',page:'board',
       active:null,chatMessages:[],chatMembers:[],channel:null,timer:null,
       loginEmail:'',awaitingOtp:false,recovery:false,refreshing:false,setupTab:'board'};
const baseUrl=String(cfg.url||'').trim();
const publicKey=String(cfg.publishableKey||'').trim();
const configured=/^https:\/\/[a-zA-Z0-9-]+\.supabase\.co\/?$/.test(baseUrl) &&
    (publicKey.startsWith('sb_publishable_') || publicKey.startsWith('eyJ'));
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fdate=s=>{try{return new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}catch(e){return ''}};
/* Plain-language versions of the database and sign-in errors players can hit. The raw text stays in brackets for troubleshooting. */
const FRIENDLY=[
 [/permission denied for (table|relation)/i,'Kit Up\'s database refused this action. That is a setup problem on our side, not something you did wrong. Try signing out and back in. If it keeps happening, tell us in Discord.'],
 [/row-level security|violates row.level/i,'You are not allowed to do that. It usually means the squad is not yours, you were removed or blocked, or your sign-in expired. Sign in again and retry.'],
 [/jwt expired|invalid jwt|jwt/i,'Your sign-in expired. Sign out and sign back in.'],
 [/invalid login credentials/i,'That email and password do not match an account. Check them, or use Forgot password.'],
 [/email not confirmed/i,'Confirm your email first: open the link we sent you, then sign in.'],
 [/user already registered|already been registered/i,'That email already has an account. Sign in instead, or use Forgot password.'],
 [/password should be at least|weak password|password.*characters/i,'Choose a longer password: at least 8 characters.'],
 [/rate limit|only request this after|too many requests|over_email_send_rate_limit/i,'Too many tries in a short time. Wait a minute and try again.'],
 [/duplicate key|already exists|23505/i,'That already exists. For example, you already requested to join this squad.'],
 [/violates check constraint|23514/i,'One of the values is outside what is allowed, such as a name or title that is too short or too long.'],
 [/violates foreign key|23503/i,'That squad or player no longer exists. Refresh the board and try again.'],
 [/does not exist|42P01|schema cache/i,'Squad finder is not fully set up on our side yet. It is not caused by you.'],
 [/failed to fetch|networkerror|load failed|network request failed/i,'Could not reach Kit Up. Check your connection and try again.']
];
const err=e=>{const raw=(e&&(e.message||e.error_description||e.details))||String(e||'Unknown error');
 const code=e&&e.code?String(e.code):'';const hit=FRIENDLY.find(([re])=>re.test(raw)||(code&&re.test(code)))||(code==='42501'?FRIENDLY[0]:null);
 return hit?hit[1]+' (Technical detail: '+raw+')':raw};
globalThis.KuLfgErr=err;
const formVal=(form,key)=>String(new FormData(form).get(key)||'').trim();
const isLfg=()=>typeof S!=='undefined' && S.view==='squad';
function snap(){const root=document.querySelector('.live-lfg');if(!root)return null;const f={};root.querySelectorAll('input[name],textarea[name],select[name]').forEach(e=>{if(e.type!=='password')f[e.name]=e.value});
 const a=document.activeElement;return{f,y:window.scrollY,focus:a&&a.name&&root.contains(a)?{n:a.name,s:a.selectionStart,e:a.selectionEnd}:null,msg:(document.getElementById('liveLfgMessages')||{}).scrollTop}}
function restore(t){if(!t)return;const root=document.querySelector('.live-lfg');if(!root)return;
 for(const [n,v] of Object.entries(t.f)){const e=root.querySelector('[name="'+n+'"]');if(e&&e.tagName!=='SELECT'&&!e.value)e.value=v}
 window.scrollTo(0,t.y);if(t.focus){const e=root.querySelector('[name="'+t.focus.n+'"]');if(e){e.focus();try{e.setSelectionRange(t.focus.s,t.focus.e)}catch(x){}}}}
let drawing=false;
function draw(){syncAcct();if(!isLfg()||drawing||typeof window.kuRender!=='function')return;drawing=true;try{const t=snap();window.kuRender();restore(t)}finally{drawing=false}}
function flash(v,asError=false){L.error=asError?String(v):''; L.message=asError?'':String(v);draw();}
function resetNotice(){L.error='';L.message='';}
async function run(fn){if(L.busy)return;L.busy=true;resetNotice();draw();try{await fn()}catch(e){L.error=err(e);draw()}finally{L.busy=false;draw()}}
async function refreshAccount(){if(!L.client)return;try{
  const {data,error}=await L.client.auth.getUser();if(error)throw error;
  L.user=data.user||null;
  if(L.user){await loadProfile();await fetchBoard();} else {L.profile=null;L.loaded=false;L.groups=[];}
  draw();
}catch(e){L.error=err(e);draw()}}
async function loadProfile(){if(!L.user)return;const {data,error}=await L.client.from('lfg_profiles').select('*').eq('id',L.user.id).maybeSingle();if(error)throw error;L.profile=data||null}
async function fetchBoard(){if(!L.client||!L.user||L.refreshing)return;L.refreshing=true;
try{
 const id=L.user.id;
 const [groupsR,requestsR,memberR,closedR]=await Promise.all([
  L.client.from('lfg_groups').select('*').eq('status','open').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100),
  L.client.from('lfg_join_requests').select('*').eq('user_id',id).order('created_at',{ascending:false}).limit(120),
  L.client.from('lfg_members').select('group_id,role').eq('user_id',id).limit(100),
  L.client.from('lfg_groups').select('*').eq('leader_id',id).order('created_at',{ascending:false}).limit(35)
 ]);
 for(const r of [groupsR,requestsR,memberR,closedR])if(r.error)throw r.error;
 L.requests=requestsR.data||[];L.members=memberR.data||[];
 const unique=new Map([...groupsR.data,...closedR.data].map(g=>[g.id,g]));
 const unseen=L.members.map(m=>m.group_id).filter(gid=>!unique.has(gid));
 if(unseen.length){const q=await L.client.from('lfg_groups').select('*').in('id',unseen);if(q.error)throw q.error;for(const g of q.data||[])unique.set(g.id,g)}
 L.groups=[...unique.values()].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const ids=[...new Set(L.groups.map(x=>x.leader_id))];
 if(ids.length){const r=await L.client.from('lfg_people').select('id,display_name,region,platform').in('id',ids);if(r.error)throw r.error;for(const u of r.data||[])L.profiles[u.id]=u}
 L.loaded=true;L.online=true;
}catch(e){L.error=err(e)}finally{L.refreshing=false;draw()}}

const PWMIN=8, siteUrl=()=>window.location.href.split('#')[0].split('?')[0];
function readAuth(form){const email=formVal(form,'email').toLowerCase(),pw=String(new FormData(form).get('password')||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid email address');
 if(pw.length<PWMIN)throw Error('Password must be at least '+PWMIN+' characters');return{email,pw}}
async function signIn(e){e.preventDefault();const form=e.currentTarget;await run(async()=>{const {email,pw}=readAuth(form);L.loginEmail=email;
 const {error}=await L.client.auth.signInWithPassword({email,password:pw});if(error)throw error;await refreshAccount()})}
async function signUp(form){await run(async()=>{const {email,pw}=readAuth(form);L.loginEmail=email;
 const {data,error}=await L.client.auth.signUp({email,password:pw,options:{emailRedirectTo:siteUrl()}});if(error)throw error;
 if(data&&data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0)throw Error('That email already has an account. Sign in instead.');
 if(data&&data.session){await refreshAccount()}else L.message='Account created. Check your email to confirm it, then sign in.'})}
async function forgot(form){await run(async()=>{const email=formVal(form,'email').toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Type your email above first');
 const {error}=await L.client.auth.resetPasswordForEmail(email,{redirectTo:siteUrl()});if(error)throw error;
 L.message='If that email has an account, a password reset link is on its way.'})}
async function setNewPassword(e){e.preventDefault();const form=e.currentTarget;await run(async()=>{const pw=String(new FormData(form).get('password')||'');
 if(pw.length<PWMIN)throw Error('Password must be at least '+PWMIN+' characters');
 const {error}=await L.client.auth.updateUser({password:pw});if(error)throw error;L.recovery=false;L.message='Password updated.';await refreshAccount()})}
async function logout(){await run(async()=>{const {error}=await L.client.auth.signOut();if(error)throw error;L.user=null;L.profile=null;L.groups=[];L.loaded=false;L.page='board';L.message='Signed out';})}
async function updateProfile(e){e.preventDefault();await run(async()=>{
 const display=formVal(e.currentTarget,'display_name');if(display.length<2||display.length>32)throw Error('Activision ID must be 2–32 characters');
 const payload={id:L.user.id,display_name:display,region:formVal(e.currentTarget,'region'),platform:formVal(e.currentTarget,'platform'),updated_at:new Date().toISOString()};
 const q=L.client.from('lfg_profiles');/* update or insert, not upsert: an upsert also rewrites the id column, which the database does not allow players to change */
 const {error}=L.profile?await q.update({display_name:payload.display_name,region:payload.region,platform:payload.platform,updated_at:payload.updated_at}).eq('id',L.user.id):await q.insert(payload);if(error)throw error;
 await loadProfile();await fetchBoard();L.page='board';L.message='Profile saved.';
 })}
async function createGroup(e){e.preventDefault();await run(async()=>{
 if(!L.profile)throw Error('Complete your player profile first');
 const p={title:formVal(e.currentTarget,'title'),description:formVal(e.currentTarget,'description'),
 mode:formVal(e.currentTarget,'mode'),region:formVal(e.currentTarget,'region'),
 platform:formVal(e.currentTarget,'platform'),mic:formVal(e.currentTarget,'mic'),
 playstyle:formVal(e.currentTarget,'playstyle'),capacity:Number(formVal(e.currentTarget,'capacity')),leader_id:L.user.id};
 if(p.title.length<4)throw Error('Give your squad a title (4+ characters)');
 const {data,error}=await L.client.from('lfg_groups').insert(p).select('id').single();if(error)throw error;
 L.page='board';L.message='Your squad is live and visible to signed-in players.';await fetchBoard();
 if(data?.id)await openChat(data.id);
 })}
async function requestJoin(gid){await run(async()=>{
 const {error}=await L.client.from('lfg_join_requests').insert({group_id:gid,user_id:L.user.id,note:''});if(error)throw error;
 L.message='Join request sent to the squad leader.';await fetchBoard();
 })}
async function decideRequest(reqId,status){if(!['accepted','declined'].includes(status))return;
 await run(async()=>{const {error}=await L.client.from('lfg_join_requests').update({status}).eq('id',reqId);if(error)throw error;
 L.message=status==='accepted'?'Player approved — they can now join the private chat.':'Request declined.';await fetchBoard();})}
async function closeGroup(gid){if(!confirm('Close this squad to new players? Members can still read their chat until it expires.'))return;
 await run(async()=>{const {error}=await L.client.from('lfg_groups').update({status:'closed'}).eq('id',gid);if(error)throw error;
 L.message='Group closed to new requests.';await fetchBoard();})}
async function leaveGroup(gid){if(!confirm('Leave this squad? You will lose access to its chat.'))return;
 await run(async()=>{const {error}=await L.client.from('lfg_members').delete().eq('group_id',gid).eq('user_id',L.user.id);if(error)throw error;
 L.page='board';L.active=null;disconnectChat();await fetchBoard();L.message='You left the group.';})}
async function removeMember(gid,uid){if(!confirm('Remove this member from the squad?'))return;
 await run(async()=>{const {error}=await L.client.from('lfg_members').delete().eq('group_id',gid).eq('user_id',uid);if(error)throw error;await fetchChat(gid);L.message='Member removed.';})}
async function reportItem(gid,messageId,targetId){const reason=prompt('What happened? Describe the issue (at least 5 characters).');if(reason===null)return;
 if(reason.trim().length<5){flash('Please describe the issue in at least 5 characters.',true);return;}
 await run(async()=>{const item={reporter_id:L.user.id,reason:reason.trim().slice(0,350),group_id:gid||null,message_id:messageId||null,target_user_id:targetId||null};
 const {error}=await L.client.from('lfg_reports').insert(item);if(error)throw error;
 L.message='Report submitted for moderation review.';})}
async function blockUser(uid){if(!uid||uid===L.user.id)return;if(!confirm('Block this player? Their posts and messages will no longer appear to you.'))return;
 await run(async()=>{const {error}=await L.client.from('lfg_blocks').insert({blocker_id:L.user.id,blocked_id:uid});if(error && error.code!=='23505')throw error;
 if(L.active){disconnectChat();L.active=null;L.page='board'}await fetchBoard();L.message='Player blocked.';})}
function disconnectChat(){if(L.channel&&L.client)L.client.removeChannel(L.channel).catch(()=>{});L.channel=null;}
async function openChat(gid){L.active=gid;L.page='chat';L.chatMessages=[];L.chatMembers=[];disconnectChat();draw();await fetchChat(gid);
 if(L.client&&L.active===gid){L.channel=L.client.channel('kitup-squad-'+gid)
 .on('postgres_changes',{event:'INSERT',schema:'public',table:'lfg_messages',filter:'group_id=eq.'+gid},()=>{if(L.active===gid)fetchChat(gid)})
 .subscribe();}
}
async function fetchChat(gid){if(!L.client||!L.user||L.active!==gid)return;
 try{const [msgR,memR]=await Promise.all([
 L.client.from('lfg_messages').select('id,sender_id,kind,body,created_at').eq('group_id',gid).order('created_at',{ascending:false}).limit(100),
 L.client.from('lfg_members').select('user_id,role').eq('group_id',gid)
 ]);if(msgR.error)throw msgR.error;if(memR.error)throw memR.error;
 L.chatMessages=(msgR.data||[]).reverse();L.chatMembers=memR.data||[];
 const ids=[...new Set([...L.chatMembers.map(x=>x.user_id),...L.chatMessages.map(x=>x.sender_id)])];
 if(ids.length){const {data,error}=await L.client.from('lfg_people').select('id,display_name').in('id',ids);if(error)throw error;for(const p of data||[])L.profiles[p.id]=p;}
 L.error='';draw();
 }catch(e){L.error=err(e);draw()}}
async function sendMessage(e){e.preventDefault();await run(async()=>{
 const input=e.currentTarget.querySelector('[name="message"]');const message=String(input?.value||'').trim();
 if(!message)return;
 if(message.length>600)throw Error('Message too long');
 const {error}=await L.client.from('lfg_messages').insert({group_id:L.active,sender_id:L.user.id,kind:'text',body:message});if(error)throw error;
 await fetchChat(L.active);L.message='Message sent.';
 })}
async function shareActivisionId(e){e.preventDefault();await run(async()=>{
 const id=formVal(e.currentTarget,'activision');if(id.length<3||id.length>75)throw Error('Enter your Activision ID (3–75 characters).');
 if(!confirm('Share your Activision ID inside this private squad chat?'))return;
 const {error}=await L.client.from('lfg_messages').insert({group_id:L.active,sender_id:L.user.id,kind:'activision_id',body:id});if(error)throw error;
 await fetchChat(L.active);L.message='ID shared with approved squad members. Send the actual game invite in Call of Duty.';
 })}
function copyId(s){if(navigator.clipboard?.writeText)navigator.clipboard.writeText(s).then(()=>flash('Activision ID copied. Invite them inside Call of Duty.'),()=>prompt('Copy Activision ID',s));else prompt('Copy Activision ID',s)}
function copyMessageId(id){const m=L.chatMessages.find(x=>x.id===id&&x.kind==='activision_id');if(m)copyId(m.body)}
function setFilter(type,value){L[type]=value;draw();}
function setPage(page){L.page=page;if(page!=='chat')disconnectChat();draw()}
function getGroup(id){return L.groups.find(g=>g.id===id)}
function requestFor(gid){return L.requests.find(r=>r.group_id===gid)}
function memberOf(gid){return L.members.some(m=>m.group_id===gid)}
function selectField(name,opts,selected){return `<select class="select" name="${name}">${opts.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}</select>`}
const choices={mode:['Multiplayer','Ranked','DMZ'],region:['NA','EU','Asia','Oceania','Other'],platform:['Crossplay','PlayStation','Xbox','PC'],mic:['Required','Preferred','Optional'],playstyle:['Competitive','Casual','Tactical','Objective']};
function groupCard(g){const mine=g.leader_id===L.user.id,joined=memberOf(g.id),req=requestFor(g.id);
 const active=g.status==='open'&&new Date(g.expires_at)>new Date(),full=g.member_count>=g.capacity;
 const status=mine?'YOUR SQUAD':joined?'SQUAD MEMBER':req?.status==='pending'?'REQUEST PENDING':req?.status==='declined'?'REQUEST DECLINED':'OPEN SQUAD';
 return `<article class="card live-lfg-card"><div class="row space wrap"><span class="live-lfg-tag">${status}</span><span class="live-lfg-count">${g.member_count}/${g.capacity} PLAYERS</span></div>
 <h3>${esc(g.title)}</h3><div class="tiny" style="margin:5px 0 12px">HOST: ${esc(L.profiles[g.leader_id]?.display_name||'KitUp player')}</div>
 <div class="live-lfg-tags"><span>${esc(g.mode)}</span><span>${esc(g.region)}</span><span>${esc(g.platform)}</span><span>MIC ${esc(g.mic)}</span><span>${esc(g.playstyle)}</span></div>
 <p class="live-lfg-desc">${esc(g.description||'Looking for teammates.')}</p>
 <div class="tiny">${active?'Expires '+esc(new Date(g.expires_at).toLocaleString()):'Closed or expired'}</div>
 <div class="btnrow">${mine||joined?`<button class="btn primary" onclick="LiveKitUpLFG.openChat('${g.id}')">OPEN SQUAD CHAT</button>`:
 req?`<button class="btn ghost" disabled>${esc(req.status.toUpperCase())}</button>`:
 active&&!full?`<button class="btn primary" onclick="LiveKitUpLFG.requestJoin('${g.id}')">REQUEST TO JOIN</button>`:'<button class="btn ghost" disabled>FULL / CLOSED</button>'}
 ${mine?`<button class="btn ghost" onclick="LiveKitUpLFG.viewRequests('${g.id}')">JOIN REQUESTS</button>${active?`<button class="btn ghost" onclick="LiveKitUpLFG.closeGroup('${g.id}')">CLOSE</button>`:''}`:
 joined?`<button class="btn ghost" onclick="LiveKitUpLFG.leaveGroup('${g.id}')">LEAVE</button>`:
 `<button class="btn ghost" onclick="LiveKitUpLFG.reportItem('${g.id}',null,'${g.leader_id}')">REPORT</button><button class="btn ghost" onclick="LiveKitUpLFG.blockUser('${g.leader_id}')">BLOCK</button>`}</div></article>`}
function boardView(){let groups=L.groups.filter(g=> (g.status==='open'&&new Date(g.expires_at)>new Date())||memberOf(g.id)||g.leader_id===L.user.id);
 groups=groups.filter(g=>(L.filterMode==='All'||g.mode===L.filterMode)&&(L.filterRegion==='All'||g.region===L.filterRegion)&&(L.filterMic==='All'||g.mic===L.filterMic)&&(!L.query||(g.title+' '+g.description).toLowerCase().includes(L.query.toLowerCase())));
 return `<div class="live-lfg-top"><div><div class="eyebrow">REAL SQUADS / SECURE CHAT</div><h1 class="huge">LOOKING <span class="accent">FOR GROUP.</span></h1><p class="muted">Find teammates, request a spot, and chat after approval.</p></div><button class="btn primary" onclick="LiveKitUpLFG.setPage('create')">＋ CREATE SQUAD</button></div>
 <div class="live-lfg-notice">◉ LIVE ACCOUNT: <b>${esc(L.profile.display_name)}</b> <span class="tiny">· ${esc(L.user.email||'Authenticated')}</span> <button class="btn ghost" onclick="LiveKitUpLFG.setPage('profile')">PROFILE</button> <button class="btn ghost" onclick="LiveKitUpLFG.logout()">SIGN OUT</button></div>
 <div class="card pad live-lfg-filters"><label>MODE ${selectField('mode',['All',...choices.mode],L.filterMode).replace('<select ','<select onchange="LiveKitUpLFG.setFilter(\'filterMode\',this.value)" ')}</label><label>REGION ${selectField('region',['All',...choices.region],L.filterRegion).replace('<select ','<select onchange="LiveKitUpLFG.setFilter(\'filterRegion\',this.value)" ')}</label><label>MIC ${selectField('mic',['All',...choices.mic],L.filterMic).replace('<select ','<select onchange="LiveKitUpLFG.setFilter(\'filterMic\',this.value)" ')}</label></div>
 <div class="row space wrap" style="margin:15px 0"><div class="h2">SQUAD BOARD</div><div class="row wrap"><span class="tiny">${groups.length} REAL LISTING${groups.length===1?'':'S'}</span><button class="btn ghost" onclick="LiveKitUpLFG.refresh()">↻ REFRESH</button></div></div>
 <div class="live-lfg-grid">${groups.length?groups.map(groupCard).join(''):`<div class="card pad live-lfg-empty"><div style="font-size:32px">⌁</div><h3>No squads available</h3><p>There are no public squads matching these filters yet. Create the first one or change the filters.</p></div>`}</div>`}
function profileView(){return `<div class="eyebrow">KITUP / PLAYER ACCOUNT</div><h1 class="huge">PLAYER <span class="accent">PROFILE.</span></h1><div class="card pad live-lfg-panel"><form onsubmit="LiveKitUpLFG.updateProfile(event)"><div class="live-lfg-fields"><label class="live-lfg-wide">ACTIVISION ID (YOUR PLAYER NAME)<input class="input" name="display_name" required minlength="2" maxlength="32" placeholder="Name#1234567" autocomplete="off" value="${esc(L.profile?.display_name||'')}"></label><label>REGION ${selectField('region',choices.region,L.profile?.region||'NA')}</label><label>PLATFORM ${selectField('platform',choices.platform,L.profile?.platform||'Crossplay')}</label></div><p class="tiny" style="margin:15px 0">Your Activision ID name shows to other players, but the numbers after # stay hidden (Name#*******) until a squad leader accepts you. After that, squad members can see each other's full IDs. Your email is never shown.</p><div class="btnrow"><button class="btn primary" type="submit">SAVE PROFILE</button>${L.profile?`<button class="btn ghost" type="button" onclick="LiveKitUpLFG.setPage('board')">BACK</button>`:''}</div></form></div>`}
function createView(){return `<div class="eyebrow">KITUP / SQUAD LEADER</div><h1 class="huge">CREATE A <span class="accent">SQUAD.</span></h1><div class="card pad live-lfg-panel"><form onsubmit="LiveKitUpLFG.createGroup(event)"><div class="live-lfg-fields"><label class="live-lfg-wide">GROUP TITLE<input class="input" name="title" required minlength="4" maxlength="70" placeholder="Ranked objective grinders"></label><label>MODE ${selectField('mode',choices.mode,'Multiplayer')}</label><label>REGION ${selectField('region',choices.region,L.profile?.region||'NA')}</label><label>PLATFORM ${selectField('platform',choices.platform,L.profile?.platform||'Crossplay')}</label><label>MIC ${selectField('mic',choices.mic,'Required')}</label><label>PLAYSTYLE ${selectField('playstyle',choices.playstyle,'Competitive')}</label><label>SQUAD SIZE ${selectField('capacity',['2','3','4','5','6'],'4')}</label><label class="live-lfg-wide">DESCRIPTION<textarea class="input" name="description" maxlength="400" rows="3" placeholder="Your requirements and what you plan to play"></textarea></label></div><p class="tiny" style="margin:15px 0">Groups automatically expire after 12 hours to keep the board current. Join requests require your approval.</p><div class="btnrow"><button class="btn primary" type="submit">PUBLISH SQUAD</button><button class="btn ghost" type="button" onclick="LiveKitUpLFG.setPage('board')">CANCEL</button></div></form></div>`}
function requestsView(){const g=getGroup(L.active);if(!g)return `<div class="card pad">Group not found. <button class="btn" onclick="LiveKitUpLFG.setPage('board')">BACK</button></div>`;
const reqs=L.hostRequests||[];
return `<div class="eyebrow">SQUAD LEADER / APPROVAL</div><h1 class="huge">JOIN <span class="accent">REQUESTS.</span></h1><h2 class="h2">${esc(g.title)}</h2><div class="btnrow"><button class="btn ghost" onclick="LiveKitUpLFG.setPage('board')">← BACK TO BOARD</button></div><p class="tiny" style="margin:14px 0 0">ID numbers stay hidden (Name#*******) until you accept. Accepted members can see each other's IDs.</p><div class="card" style="margin-top:18px">${reqs.length?reqs.map(r=>`<div class="entry" style="gap:15px;flex-wrap:wrap"><div style="flex:1"><b>${esc(L.profiles[r.user_id]?.display_name||'KitUp player')}</b><div class="tiny">${esc(r.status)} · ${esc(new Date(r.created_at).toLocaleString())}</div></div>${r.status==='pending'?`<button class="btn primary" onclick="LiveKitUpLFG.decideRequest('${r.id}','accepted')">ACCEPT</button><button class="btn ghost" onclick="LiveKitUpLFG.decideRequest('${r.id}','declined')">DECLINE</button>`:''}</div>`).join(''):`<div class="pad">No join requests for this squad yet.</div>`}</div>`}
function chatView(){const g=getGroup(L.active);if(!g)return `<div class="card pad">Group not found. <button class="btn" onclick="LiveKitUpLFG.setPage('board')">BACK</button></div>`;
 const mem=memberOf(g.id) || g.leader_id===L.user.id;
 if(!mem)return `<div class="card pad">This chat is private to approved members. <button class="btn" onclick="LiveKitUpLFG.setPage('board')">BACK</button></div>`;
 return `<div class="eyebrow">KITUP / PRIVATE SQUAD CHAT</div><h1 class="huge">${esc(g.title)}</h1><div class="row space wrap"><p class="muted">${g.member_count}/${g.capacity} approved members · ${esc(g.mode)}</p><button class="btn ghost" onclick="LiveKitUpLFG.setPage('board')">← BOARD</button></div>
 <div class="live-lfg-chat-layout"><section class="card live-lfg-chat"><div class="live-lfg-chathead">◉ GROUP CHAT <small>Approved members only</small></div><div class="live-lfg-messages" id="liveLfgMessages" aria-live="polite">${L.chatMessages.length?L.chatMessages.map(m=>`<div class="live-lfg-message ${m.sender_id===L.user.id?'mine':''}"><b>${esc(L.profiles[m.sender_id]?.display_name||'Player')}</b> <small>${esc(fdate(m.created_at))}</small>${m.kind==='activision_id'?`<p>🎮 ACTIVISION ID</p><strong>${esc(m.body)}</strong><button class="btn ghost" onclick="LiveKitUpLFG.copyMessageId('${m.id}')">COPY ID</button>`:`<p>${esc(m.body)}</p>`}${m.sender_id!==L.user.id?`<button class="live-lfg-report" onclick="LiveKitUpLFG.reportItem('${g.id}','${m.id}','${m.sender_id}')">REPORT</button>`:''}</div>`).join(''):`<div class="live-lfg-empty">No messages yet. Be the first to say hello.</div>`}</div><form class="live-lfg-compose" onsubmit="LiveKitUpLFG.sendMessage(event)"><input name="message" class="input" maxlength="600" required placeholder="Message the squad…" autocomplete="off"><button class="btn primary" type="submit">SEND</button></form></section>
 <aside class="card pad live-lfg-panel"><div class="h2">SQUAD MEMBERS</div><div style="margin:12px 0 20px">${L.chatMembers.map(m=>`<div class="row space" style="padding:9px 0;border-bottom:1px solid #3b2850"><div><b>${esc(L.profiles[m.user_id]?.display_name||'KitUp player')}</b><div class="tiny">${esc(m.role)}</div></div>${g.leader_id===L.user.id&&m.user_id!==L.user.id?`<button class="btn ghost" onclick="LiveKitUpLFG.removeMember('${g.id}','${m.user_id}')">REMOVE</button>`:''}</div>`).join('')}</div><div class="h2">ACTIVISION INVITES</div><p class="tiny" style="margin:10px 0">Only share an ID if you want teammates to add you. Sending it posts to this private chat, not the public squad board.</p><form onsubmit="LiveKitUpLFG.shareActivisionId(event)"><input class="input" name="activision" maxlength="75" placeholder="YourActivisionID#1234567" required><div class="btnrow"><button class="btn primary" type="submit">SHARE ID IN CHAT</button></div></form><p class="tiny" style="margin-top:11px">Use Call of Duty to send the actual game invite. KitUp cannot send an Activision party invite without an official integration.</p></aside></div>`}
function unauthView(){return `<div class="eyebrow">KITUP / PLAYER ACCOUNT</div><h1 class="huge">FIND YOUR <span class="accent">SQUAD.</span></h1><div class="card pad live-lfg-panel"><div class="h2">SIGN IN OR CREATE AN ACCOUNT</div><p class="muted" style="margin:10px 0 20px">Use your email and a password. No demo players or fake chat messages.</p><form onsubmit="LiveKitUpLFG.signIn(event)"><div class="live-lfg-fields"><label>EMAIL ADDRESS<input class="input" type="email" name="email" required autocomplete="email" placeholder="you@example.com" value="${esc(L.loginEmail)}"></label><label>PASSWORD<input class="input" type="password" name="password" required minlength="8" autocomplete="current-password" placeholder="At least 8 characters"></label></div><div class="btnrow"><button class="btn primary" type="submit">SIGN IN</button><button class="btn ghost" type="button" onclick="LiveKitUpLFG.signUp(this.form)">CREATE ACCOUNT</button><button class="btn ghost" type="button" onclick="LiveKitUpLFG.forgot(this.form)">FORGOT PASSWORD</button></div></form><p class="tiny" style="margin-top:18px">Your email is never shown to other players. After you sign in you set your Activision ID. It stays hidden from other players until a squad leader accepts you.</p></div>`}
function recoveryView(){return `<div class="eyebrow">KITUP / PLAYER ACCOUNT</div><h1 class="huge">NEW <span class="accent">PASSWORD.</span></h1><div class="card pad live-lfg-panel"><form onsubmit="LiveKitUpLFG.setNewPassword(event)"><label>NEW PASSWORD<input class="input" type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><div class="btnrow"><button class="btn primary" type="submit">SAVE PASSWORD</button></div></form></div>`}
function setupTab(which){if(!['board','create','chat'].includes(which))return;L.setupTab=which;draw()}
function setupView(){
 const tabs=[['board','SQUAD BOARD'],['create','CREATE SQUAD'],['chat','PRIVATE CHAT']]
 .map(([id,label])=>`<button class="btn ${L.setupTab===id?'primary':'ghost'}" onclick="LiveKitUpLFG.setupTab('${id}')">${label}</button>`).join('');
 let body='';
 if(L.setupTab==='board')body=`<div class="live-lfg-top"><div><div class="eyebrow">LFG / SQUAD DISCOVERY</div><h2 class="h2" style="font-size:25px;margin-top:8px">FIND YOUR TEAM</h2><p class="muted" style="margin-top:6px">Search by game mode, region, platform and microphone.</p></div><span class="tier">NO SAMPLE PLAYERS</span></div><div class="live-lfg-filters card pad" style="margin-top:16px"><label>MODE <select class="select" disabled><option>All modes</option></select></label><label>REGION <select class="select" disabled><option>All regions</option></select></label><label>MIC <select class="select" disabled><option>All preferences</option></select></label></div><div class="card pad" style="margin-top:16px;min-height:155px;display:flex;justify-content:center;flex-direction:column;align-items:center;text-align:center;gap:8px"><div style="font-size:30px">♟</div><div class="h2">NO LIVE SQUADS YET</div><p class="muted">Real listings appear here after the database is connected and a player creates a group.</p></div>`;
 else if(L.setupTab==='create')body=`<div class="eyebrow">LFG / SQUAD HOSTING</div><h2 class="h2" style="margin:8px 0 14px;font-size:25px">CREATE A SQUAD</h2><div class="card pad live-lfg-panel"><div class="live-lfg-formgrid"><label>SQUAD TITLE<input class="input" disabled placeholder="Ranked grind · Need 2"></label><label>GAME MODE<select class="select" disabled><option>Multiplayer / Ranked / DMZ</option></select></label><label>REGION<select class="select" disabled><option>North America</option></select></label><label>PLATFORM<select class="select" disabled><option>Crossplay</option></select></label><label>MIC<select class="select" disabled><option>Required</option></select></label><label>MAX PLAYERS<select class="select" disabled><option>4</option></select></label><label class="live-lfg-wide">DETAILS<textarea class="input" disabled rows="3" placeholder="Tell players your playstyle and what you're looking for."></textarea></label></div><div class="btnrow"><button disabled class="btn primary">PUBLISH SQUAD</button></div><p class="tiny" style="margin-top:10px">Publishing is enabled after sign-in and backend setup. There are no fake posts in this preview.</p></div>`;
 else body=`<div class="eyebrow">LFG / APPROVED TEAMMATES</div><h2 class="h2" style="margin:8px 0 14px;font-size:25px">SQUAD CHAT</h2><div class="live-lfg-chat-layout"><section class="card live-lfg-chat"><div class="live-lfg-chathead">◉ PRIVATE CHAT <small>Squad members only</small></div><div class="live-lfg-messages" style="min-height:240px;display:flex;align-items:center;justify-content:center;text-align:center"><div><div style="font-size:32px">◉</div><div class="h2" style="margin:10px 0">MESSAGES APPEAR HERE</div><p class="muted">No invented users or chat messages. Approved members can send messages once connected.</p></div></div><div class="live-lfg-compose"><input class="input" disabled placeholder="Message your squad…"><button class="btn primary" disabled>SEND</button></div></section><aside class="card pad live-lfg-panel"><h2 class="h2">ACTIVISION INVITES</h2><p class="muted" style="margin:10px 0">Share your Activision ID with approved teammates only, then send a game invite from Call of Duty.</p><input class="input" disabled placeholder="PlayerName#1234567"><button class="btn ghost" style="margin-top:10px" disabled>SHARE ID IN CHAT</button><p class="tiny" style="margin-top:15px">KitUp doesn't send Call of Duty game invites without an official integration.</p></aside></div>`;
 return `<div class="eyebrow">KITUP / LIVE PLAYER FEATURES</div><h1 class="huge">LOOKING <span class="accent">FOR GROUP.</span></h1><p class="muted" style="max-width:64ch;margin-bottom:14px">Real squads, approval-based chat, and private Activision ID sharing. This is the unconnected interface preview.</p><div class="live-lfg-demo-banner"><b>BACKEND NOT CONNECTED</b><span>The app UI is ready for real accounts and database operations; no live matchmaking is running yet.</span></div><div class="btnrow" style="margin:18px 0">${tabs}</div>${body}<div class="card pad live-lfg-panel" style="margin-top:19px"><h2 class="h2">ACTIVATE REAL LFG</h2><p class="muted" style="margin:9px 0">Create a Supabase project, run the included <b>supabase/schema.sql</b> migration, add your public project URL and publishable key to the KitUp HTML, then publish over HTTPS.</p><p class="tiny">Use only the public publishable key. Never place a secret or service_role key in a web page. Screens above are interface previews, not live player data.</p></div>`;
}
function liveView(){let inner='';if(!configured)inner=setupView();
else if(!L.client)inner=`<div class="card pad live-lfg-panel">Connecting to secure squad services… ${esc(L.error)}</div>`;
else if(L.recovery)inner=recoveryView();
else if(!L.user)inner=unauthView();
else if(!L.profile || L.page==='profile')inner=profileView();
else if(L.page==='create')inner=createView();
else if(L.page==='requests')inner=requestsView();
else if(L.page==='chat')inner=chatView();
else inner=boardView();
return `<div class="live-lfg">${L.error?`<div class="live-lfg-error" role="alert">${esc(L.error)}</div>`:''}${L.message?`<div class="live-lfg-success" role="status">${esc(L.message)}</div>`:''}${L.busy?'<div class="live-lfg-loading">WORKING…</div>':''}${inner}</div>`}
async function viewRequests(gid){L.active=gid;L.hostRequests=[];L.page='requests';draw();
 try{const r=await L.client.from('lfg_join_requests').select('*').eq('group_id',gid).order('created_at',{ascending:false});if(r.error)throw r.error;
 L.hostRequests=r.data||[];const ids=[...new Set(L.hostRequests.map(x=>x.user_id))];
 if(ids.length){const z=await L.client.from('lfg_people').select('id,display_name').in('id',ids);if(z.error)throw z.error;for(const p of z.data||[])L.profiles[p.id]=p;}draw();}
 catch(e){flash(err(e),true)}}
function mount(){if(!L.client || !L.user)return;if(!L.loaded&&!L.refreshing){fetchBoard()}if(L.page==='chat'){
 const el=document.getElementById('liveLfgMessages');if(el&&L.chatMessages.length)el.scrollTop=el.scrollHeight;}}
function periodic(){if(!isLfg()||!L.client||!L.user||L.busy||L.refreshing)return;
 if(L.page==='board')fetchBoard();else if(L.page==='chat'&&L.active)fetchChat(L.active);else if(L.page==='requests'&&L.active)viewRequests(L.active);}
async function init(){if(!configured)return;
 if(!window.supabase?.createClient){L.error='Supabase client library could not load. Check your network and reload.';draw();return;}
 L.client=window.supabase.createClient(baseUrl,publicKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 L.client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){L.recovery=true;draw();return}
  if(event==='SIGNED_IN'||event==='SIGNED_OUT'){
   const id=session?.user?.id||null;
   if(id!==L.user?.id){L.user=session?.user||null;L.profile=null;L.loaded=false;L.groups=[];L.requests=[];disconnectChat();L.page='board';setTimeout(()=>refreshAccount(),0);}
  }
 });
 await refreshAccount();
 if(!L.timer)L.timer=setInterval(periodic,12000);
}
window.LiveKitUpLFG={init,signIn,signUp,forgot,setNewPassword,logout,updateProfile,createGroup,requestJoin,decideRequest,setupTab,
closeGroup,leaveGroup,removeMember,reportItem,blockUser,openChat,sendMessage,
shareActivisionId,copyId,copyMessageId,setFilter,setPage,viewRequests,refresh:fetchBoard};
// The view is drawn by the Squad finder screen (lab.js). Starts when the In-app tab is first opened.
window.kuLfgView=function(){setTimeout(mount,0);return liveView()};
let started=false;
window.kuLfgStart=function(){if(started)return Promise.resolve();started=true;
 return new Promise(ok=>{if(window.supabase&&window.supabase.createClient)return ok();const sc=document.createElement('script');sc.src=LIBSRC;sc.onload=ok;sc.onerror=ok;document.head.appendChild(sc)})
 .then(()=>init()).catch(e=>{L.error=err(e);draw()})};
// Magic-link sign-in returns to the site with tokens in the URL: start right away so they are read, then land on the LFG screen.
if(/access_token=|refresh_token=|error_description=/.test(location.hash)){window.kuLfgStart().then(()=>{try{history.replaceState(null,'','#squad')}catch(e){}if(typeof go==='function')go('squad')})}

/* Header account button: Sign in when signed out; Edit profile and Sign out when signed in. */
function syncAcct(){try{const b=document.getElementById('acct-b');if(b){b.classList.toggle('on',!!(L.user&&L.profile));b.setAttribute('aria-label',L.user?'Account: '+(L.profile?.display_name||'signed in'):'Sign in')}}catch(e){}}
function closeAcct(){const m=document.getElementById('kuAcct');if(m)m.remove()}
function openAcct(){closeAcct();const signed=!!(L.user);const m=document.createElement('div');m.id='kuAcct';m.className='ku-acct';m.setAttribute('role','menu');
 m.innerHTML=signed?`<div class="ku-acct-who">${esc(L.profile?.display_name||L.user.email||'Signed in')}<small>${esc(L.user.email||'')}</small></div><button role="menuitem" data-a="profile">Edit profile</button><button role="menuitem" data-a="squads">Squad finder</button><button role="menuitem" data-a="out">Sign out</button>`:`<div class="ku-acct-who">Not signed in<small>Sign in to join and create squads</small></div><button role="menuitem" data-a="in">Sign in or create account</button>`;
 m.onclick=e=>{const a=e.target.dataset&&e.target.dataset.a;if(!a)return;closeAcct();
  if(a==='out'){window.LiveKitUpLFG.logout()}
  else if(a==='profile'){L.page='profile';if(typeof go==='function')go('squad');if(S&&S.view==='squad'&&typeof window.kuRender==='function')window.kuRender()}
  else{L.page='board';if(typeof go==='function')go('squad')}};
 document.body.appendChild(m);setTimeout(()=>{const f=m.querySelector('button');f&&f.focus()},0)}
if(typeof document.addEventListener==='function'){
 document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act="account"]');if(b){e.preventDefault();window.kuLfgStart().then(()=>openAcct());return}if(!(e.target.closest&&e.target.closest('#kuAcct')))closeAcct()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAcct()})}
if(typeof addEventListener==='function')addEventListener('load',()=>setTimeout(()=>{if(configured)window.kuLfgStart()},1500));
// Squad finder: ONE list. In-app squads and Discord posts sit together, newest first.
const discordCard=p=>`<article class="card live-lfg-card"><div class="row space wrap"><span class="live-lfg-tag">DISCORD · OPEN SQUAD</span><span class="live-lfg-count">${esc(p.n)}/${esc(p.slots)} PLAYERS</span></div><h3>${esc(p.mode)}</h3><div class="live-lfg-tags">${(p.platforms||[]).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${p.note?`<p class="live-lfg-desc">${esc(p.note)}</p>`:''}<div class="tiny">${esc(p.minutesAgo)} min ago</div><div class="btnrow"><a class="btn primary" href="${esc(p.url)}" target="_blank" rel="noopener">JOIN IN DISCORD</a></div></article>`;
function discordItems(D){return (D.posts||[]).filter(p=>(L.filterMode==='All'||String(p.mode).toLowerCase().includes(String(L.filterMode).toLowerCase()))&&L.filterRegion==='All'&&L.filterMic==='All'&&(!L.query||(p.mode+' '+(p.note||'')).toLowerCase().includes(L.query.toLowerCase()))).map(p=>({t:Date.now()-(Number(p.minutesAgo)||0)*60000,html:discordCard(p)}))}
function discordNote(D){return D.st==='ok'?'':D.st==='idle'||D.st==='loading'?'<p class="tiny">Checking Discord for open squads…</p>':D.st==='not_configured'?'<p class="tiny">Discord posts aren’t connected yet. In-app squads still work.</p>':'<p class="tiny">Couldn’t reach Discord right now. In-app squads still work.</p>'}
function unifiedBoard(D){let groups=L.groups.filter(g=>(g.status==='open'&&new Date(g.expires_at)>new Date())||memberOf(g.id)||g.leader_id===L.user.id);
 groups=groups.filter(g=>(L.filterMode==='All'||g.mode===L.filterMode)&&(L.filterRegion==='All'||g.region===L.filterRegion)&&(L.filterMic==='All'||g.mic===L.filterMic)&&(!L.query||(g.title+' '+g.description).toLowerCase().includes(L.query.toLowerCase())));
 const app=groups.map(g=>({t:new Date(g.created_at).getTime(),html:groupCard(g).replace('<span class="live-lfg-tag">','<span class="live-lfg-tag">IN-APP · ')}));
 const dis=discordItems(D),all=[...app,...dis].sort((a,b)=>b.t-a.t);
 const sel=(k,name,opts,f)=>`<label>${name} ${selectField(k,['All',...opts],L[f]).replace('<select ','<select onchange="LiveKitUpLFG.setFilter(\''+f+'\',this.value)" ')}</label>`;
 return `<div class="live-lfg-top"><div><div class="eyebrow">KITUP / SQUAD FINDER</div><h1 class="huge">LOOKING <span class="accent">FOR GROUP.</span></h1><p class="muted">Every open squad in one place. Request a spot, then chat once you’re accepted.</p></div><button class="btn primary" onclick="LiveKitUpLFG.setPage('create')">＋ CREATE SQUAD</button></div>
 <div class="live-lfg-notice">◉ SIGNED IN: <b>${esc(L.profile.display_name)}</b> <span class="tiny">· ${esc(L.user.email||'Authenticated')}</span> <button class="btn ghost" onclick="LiveKitUpLFG.setPage('profile')">PROFILE</button> <button class="btn ghost" onclick="LiveKitUpLFG.logout()">SIGN OUT</button></div>
 <div class="card pad live-lfg-filters">${sel('mode','MODE',choices.mode,'filterMode')}${sel('region','REGION',choices.region,'filterRegion')}${sel('mic','MIC',choices.mic,'filterMic')}</div>
 <div class="row space wrap" style="margin:15px 0"><div class="h2">OPEN SQUADS</div><div class="row wrap"><span class="tiny">${app.length} IN-APP · ${dis.length} DISCORD</span><button class="btn ghost" onclick="LiveKitUpLFG.refresh();kuDiscordRefresh()">↻ REFRESH</button></div></div>
 ${discordNote(D)}
 <div class="live-lfg-grid">${all.length?all.map(x=>x.html).join(''):`<div class="card pad live-lfg-empty"><h3>No squads right now</h3><p>Nothing matches these filters yet. Create the first one or change the filters.</p></div>`}</div>
 <div style="margin-top:18px"><div class="tiny" style="margin-bottom:8px">Already in the Discord? Open the LFG channels:</div>${window.kuDiscordChannels?window.kuDiscordChannels():''}</div>${window.kuBanner?window.kuBanner():''}`}
window.renderSquad=function(){window.kuLfgStart();setTimeout(mount,0);
 const D=window.kuDiscord?window.kuDiscord():{st:'ok',posts:[]};
 if(configured&&L.client&&!L.recovery&&L.user&&L.profile&&L.page==='board')return '<section class="sec"><div class="live-lfg">'+(L.error?`<div class="live-lfg-error" role="alert">${esc(L.error)}</div>`:'')+(L.message?`<div class="live-lfg-success" role="status">${esc(L.message)}</div>`:'')+unifiedBoard(D)+'</div></section>';
 let extra='';
 if(configured&&L.client&&!L.recovery&&!L.user){const dis=discordItems(D);extra='<div class="live-lfg" style="margin-top:22px"><div class="h2" style="margin-bottom:10px">OPEN ON DISCORD NOW</div>'+discordNote(D)+'<div class="live-lfg-grid">'+(dis.length?dis.map(x=>x.html).join(''):(D.st==='ok'?'<div class="card pad live-lfg-empty"><p>No open Discord squads right now.</p></div>':''))+'</div><div style="margin-top:14px">'+(window.kuDiscordChannels?window.kuDiscordChannels():'')+'</div></div>'}
 return '<section class="sec">'+liveView()+extra+'</section>'};
})();
