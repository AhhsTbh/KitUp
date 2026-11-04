import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);
const inFuture=new Date(Date.now()+3600e3).toISOString();
function boot({user,groups=[],profile={id:'me',display_name:'Kyler',region:'NA',platform:'PC'},msgs=[]}){
  const inserts=[];const authCalls=[];globalThis.__authCalls=authCalls;globalThis.FormData=class{constructor(f){this.f=f}get(k){return this.f[k]}};
  const stubQuery=t=>{let single=false;const b=new Proxy(function(){},{get(_,k){
    if(k==='then')return res=>{let d=[];if(t==='lfg_profiles'||t==='lfg_people')d=single?profile:[profile];else if(t==='lfg_groups')d=single?{id:'new'}:groups;else if(t==='lfg_messages')d=msgs;else if(t==='lfg_members')d=[];res({data:d,error:null})};
    if(k==='maybeSingle'||k==='single'){single=true;return()=>b}
    if(k==='insert')return row=>{inserts.push([t,row]);return b};
    return()=>b}});return b};
  globalThis.window=globalThis;globalThis.S={view:'squad'};globalThis.__kuSquadTab='app';globalThis.go=()=>{};globalThis.kuRender=()=>{};
  globalThis.location={hash:'',href:'https://kitup.gg/'};globalThis.scrollY=0;globalThis.scrollTo=()=>{};
  globalThis.document={querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}};
  globalThis.setTimeout=(f)=>0;globalThis.setInterval=()=>0;
  globalThis.KITUP_LFG_CONFIG={url:'https://abc.supabase.co',publishableKey:'sb_publishable_x'};
  globalThis.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:user||null}}),onAuthStateChange:()=>({}),signInWithPassword:async a=>{authCalls.push(['in',a]);return{error:null}},signUp:async a=>{authCalls.push(['up',a]);return{data:{user:{identities:[{}]},session:null},error:null}},resetPasswordForEmail:async(e)=>{authCalls.push(['reset',e]);return{error:null}}},from:stubQuery,channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{}})};
  delete req.cache[req.resolve('../lfg-live.js')];req('../lfg-live.js');return inserts}
test('signed-out visitors see the sign-in screen and no squads',async()=>{boot({user:null});await window.kuLfgStart();const h=window.kuLfgView();assert.match(h,/SIGN IN OR CREATE AN ACCOUNT/);assert.match(h,/type="password"/);assert.doesNotMatch(h,/OTP|SIGN-IN EMAIL|REQUEST TO JOIN/)});
test('signed-in players see the board, and user-written text is escaped',async()=>{boot({user:{id:'me',email:'k@x.com'},groups:[{id:'g1',leader_id:'other',title:'<img src=x onerror=alert(1)>',description:'<script>x</script>',mode:'DMZ',region:'NA',platform:'PC',mic:'Preferred',playstyle:'Casual',capacity:4,member_count:1,status:'open',expires_at:inFuture,created_at:inFuture}]});await window.kuLfgStart();const h=window.kuLfgView();
 assert.match(h,/SQUAD BOARD/);assert.match(h,/REQUEST TO JOIN/);assert.match(h,/&lt;img src=x/);assert.doesNotMatch(h,/<img src=x/);assert.doesNotMatch(h,/<script>x/)});
test('a signed-in player without a profile is sent to set one up',async()=>{boot({user:{id:'me'},profile:null});await window.kuLfgStart();const h=window.kuLfgView();assert.match(h,/ACTIVISION ID \(YOUR PLAYER NAME\)/);assert.match(h,/Name#1234567/)});
test('Squad finder shows both tabs',()=>{boot({user:null});window.renderSquad=undefined;const t=fs.readFileSync('lfg-live.js','utf8');assert.match(t,/DISCORD SQUADS/);assert.match(t,/IN-APP SQUADS/)});
test('the schema locks tables down with row-level security and revokes default access',()=>{const s=fs.readFileSync('supabase/lfg_schema.sql','utf8');for(const t of ['lfg_profiles','lfg_groups','lfg_members','lfg_join_requests','lfg_messages','lfg_blocks','lfg_reports'])assert.match(s,new RegExp(`alter table public\\.${t} enable row level security`));assert.match(s,/revoke all on public\.lfg_profiles/);assert.doesNotMatch(s,/service_role/i)});
test('other players\' Activision IDs are masked until a squad leader accepts the join',()=>{const s=fs.readFileSync('supabase/lfg_schema.sql','utf8');assert.match(s,/lfg_profiles_read[\s\S]{0,80}using \(id\s*=\s*auth\.uid\(\)\)/);assert.match(s,/create or replace view public\.lfg_people/);assert.match(s,/split_part\(p\.display_name,'#',1\) \|\| '#\*{7}'/);assert.match(s,/revoke all on public\.lfg_people from anon/);const js=fs.readFileSync('lfg-live.js','utf8');assert.match(js,/from\('lfg_people'\)/);assert.doesNotMatch(js,/from\('lfg_profiles'\)\.select\('id,[^']*'\)\.in\(/)});

test('sign-in and sign-up use email and password, and short passwords are rejected',async()=>{boot({user:null});await window.kuLfgStart();const noop={preventDefault(){}};
 await LiveKitUpLFG.signIn({...noop,currentTarget:{email:'Me@Example.com',password:'longenough1'}});await LiveKitUpLFG.signUp({email:'new@example.com',password:'longenough1'});assert.match(window.kuLfgView(),/Account created/);await LiveKitUpLFG.signIn({...noop,currentTarget:{email:'me@example.com',password:'short'}});
 const c=globalThis.__authCalls;assert.deepStrictEqual(c[0],['in',{email:'me@example.com',password:'longenough1'}]);assert.strictEqual(c[1][0],'up');assert.strictEqual(c[1][1].password,'longenough1');assert.strictEqual(c.length,2);assert.match(window.kuLfgView(),/at least 8 characters/)});
