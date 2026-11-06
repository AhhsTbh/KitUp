import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';import {createRequire} from 'node:module';
const E=createRequire(import.meta.url)('../gunsmith.js');
const J=f=>JSON.parse(fs.readFileSync(new URL('../data/'+f,import.meta.url)));
const g=J('game.json'),att=J('attachments.json'),tiers=J('tiers.json');
const data={weapons:g.weapons,attachments:att,tiers,limit:5,meta:J('meta.json')};
const run=t=>{const r=E.parseRequest(t,g.weapons);return {r,out:E.recommend(r,data)}};
const sum=(w,build,stats)=>build.att.reduce((s,a)=>{const it=att[w.id].find(x=>x.s===a.s&&x.n===a.n);return s+[...(it.u||[]).map(t=>[t,1]),...(it.d||[]).map(t=>[t,-1])].reduce((q,[t,sg])=>{const m=/^([-+]?[\d.]+)%\s+(.+)$/.exec(t);return m&&stats.includes(m[2])?q+sg*Math.abs(parseFloat(m[1])):q},0)},0);

test('reads the example request: class and goals',()=>{
  const {r}=run('Give me the best low recoil assault rifle for ranked with fast ADS and good damage range');
  assert.equal(r.cls,'ar');assert.ok(['recoil','ads','range','ranked'].every(k=>r.goals.includes(k)),r.goals.join());
});
test('finds named guns, including short names like M4',()=>{
  assert.deepEqual(run('M4 low recoil').r.named.map(w=>w.id),['m4']);
  assert.deepEqual(run('kastov 762 fast ads').r.named.map(w=>w.id),['kastov-762']);
  assert.deepEqual(run('Han 86 low recoil').r.named.map(w=>w.id),['han-86']);
  assert.equal(run('low recoil smg').r.named.length,0);
});
test('every pick is a real attachment for that gun, one per slot, within the limit',()=>{
  for(const q of ['low recoil assault rifle ranked fast ads','aggressive rushing smg','long range accuracy lmg','headshot sniper','marksman rifle long range','shotgun rushing','pistol fast ads','best gun']){
    const {out}=run(q);assert.ok(out.results.length,q);
    for(const x of out.results){const slots=x.build.att.map(a=>a.s);assert.equal(new Set(slots).size,slots.length);assert.ok(slots.length<=5);
      for(const a of x.build.att){assert.ok(att[x.w.id].some(i=>i.s===a.s&&i.n===a.n),`${x.w.id} ${a.n}`);assert.ok(x.w.slots.includes(a.s))}}
  }
});
test('guns with no attachment stat data fall back to the verified live meta build, not guesses',()=>{
  const {out}=run('headshot sniper');const x=out.results[0];
  assert.ok(x.build.fromMeta);const m=data.meta.filter(b=>b.w===x.w.id).flatMap(b=>b.att.map(a=>a.n));
  assert.ok(x.build.att.every(a=>m.includes(a.n)));
});
test('a class request only returns that class',()=>{for(const [q,c] of [['low recoil smg','smg'],['long range lmg','lmg'],['assault rifle','ar']])assert.ok(run(q).out.results.every(x=>x.w.cat===c),q)});
test('a recoil build really cuts recoil more than a rush build on the same gun',()=>{
  const w=g.weapons.find(x=>x.id==='han-86'),R=['Vertical Recoil','Horizontal Recoil','Vertical Gun Kick','Horizontal Gun Kick'];
  const rec=E.pickBuild(w,att['han-86'],E.weightsFor(['recoil']),5),rush=E.pickBuild(w,att['han-86'],E.weightsFor(['rush']),5);
  assert.ok(sum(w,rec,R)>sum(w,rush,R));
  const ads=E.pickBuild(w,att['han-86'],E.weightsFor(['ads']),5);
  assert.ok(sum(w,ads,['ADS Speed'])>=sum(w,rec,['ADS Speed']));
});
test('upsides add and downsides subtract; zoom is ignored',()=>{
  const wt=E.weightsFor(['recoil']);
  assert.ok(E.scoreAttachment({u:['-20.0% Vertical Recoil']},wt)>0);
  assert.ok(E.scoreAttachment({d:['+20.0% Vertical Recoil']},wt)<0);
  assert.equal(E.scoreAttachment({u:['+658.0% Zoom Level']},wt),0);
});
test('shots to kill and practical TTK maths',()=>{
  assert.equal(E.shotsToKill(243,740),4);   // 243 ms at 740 RPM is 3 gaps, so 4 shots
  assert.equal(E.practicalTTK(243,740,1),243);
  assert.equal(E.practicalTTK(243,740,.5),Math.round((4/.5-1)*60000/740));
  assert.ok(E.practicalTTK(243,740,.5)>E.practicalTTK(243,740,.8));
  assert.equal(E.practicalTTK(null,740,.5),null);
});
test('empty or nonsense text still returns an honest, non-crashing result',()=>{
  assert.deepEqual(E.parseRequest('',g.weapons).goals,[]);
  const {out}=run('asdf qwerty');assert.ok(out.goals.includes('ranked'));
});
test('asking for fast ADS gives a build whose ADS speed is better overall, even with range in the request',()=>{
  for(const q of ['fast ads assault rifle','low recoil assault rifle for ranked with fast ads and good damage range']){
    const {out}=run(q);const x=out.results[0];
    const net=x.build.att.reduce((s,a)=>{const it=att[x.w.id].find(i=>i.s===a.s&&i.n===a.n);const f=(l,sg)=>(l||[]).reduce((q,t)=>{const m=/^([-+]?[\d.]+)%\s+ADS Speed$/.exec(t);return m?q+sg*Math.abs(parseFloat(m[1])):q},0);return s+f(it.u,1)+f(it.d,-1)},0);
    assert.ok(net>=0,`${q}: net ADS ${net}`);
  }
});
