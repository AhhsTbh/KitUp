import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';
const J=p=>JSON.parse(fs.readFileSync(p,'utf-8'));
test('trust score is calculated from its documented components, not typed in',()=>{
  const t=J('data/trust.json'),W={completeness:35,recency:30,patch_fit:25,reliability:10};
  const sum=Object.entries(W).reduce((s,[k,w])=>s+t.components[k].value*w,0)/100;
  assert.ok(Math.abs(sum-t.score)<=1.5,`score ${t.score} vs components ${sum}`);
  assert.equal(t.agreement.status,'data_unavailable');
});
test('public trust data never names an outside source',()=>{
  const raw=fs.readFileSync('data/trust.json','utf-8').toLowerCase();
  assert.ok(!raw.includes('codmunity'));
});
test('Warzone and Resurgence are marked unavailable until verified data exists',()=>{
  const m=Object.fromEntries(J('data/modes.json').modes.map(x=>[x.id,x]));
  for(const id of ['warzone','resurgence']){assert.equal(m[id].status,'data_unavailable');assert.ok(m[id].reason)}
});
test('weapons with missing numbers are flagged, not silently filled',()=>{
  const t=J('data/trust.json'),g=J('data/game.json');
  for(const w of g.weapons){const r=t.weapons[w.id];if(!r)continue;
    for(const k of r.unavailable)assert.ok(!w.live||w.live[k]==null,`${w.id}.${k} flagged missing but present`)}
});
