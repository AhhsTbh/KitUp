import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';
const J=p=>JSON.parse(fs.readFileSync(p,'utf-8'));
test('every Meta Intelligence label traces to an official patch change',()=>{
  const m=J('data/metaintel.json'),p=J('data/patches.json'),L={buff:'Recently buffed',nerf:'Recently nerfed',adjust:'Recently changed'};
  for(const [w,x] of Object.entries(m.weapons)){
    const hit=p.some(q=>q.date===x.date&&(q.changes||[]).some(c=>c.weapon===w&&L[c.type]===x.status));
    assert.ok(hit,`${w} ${x.status} ${x.date} has no matching patch change`)}
});
test('Rising/Falling are withheld while pick-rate history is short',()=>{
  const m=J('data/metaintel.json'),h=J('data/history.json');
  if(h.days.length<14)assert.equal(m.trend.status,'data_unavailable');
});
