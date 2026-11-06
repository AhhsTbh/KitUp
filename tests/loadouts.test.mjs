import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';
const J=p=>JSON.parse(fs.readFileSync(p,'utf-8'));
const g=J('data/game.json'),A=J('data/attachments.json'),L=J('data/loadouts.json').modes;
test('every Warzone and DMZ loadout is legal: real slots, one per slot, max 5',()=>{
  for(const m of ['warzone','dmz'])for(const [id,bs] of Object.entries(L[m])){const w=g.weapons.find(x=>x.id===id);assert.ok(w,id);
    for(const b of bs){const sl=b.att.map(a=>a.s);assert.ok(sl.length<=5&&new Set(sl).size===sl.length,`${m} ${id}`);
      for(const a of b.att){if(a.s==='Apex')continue;assert.ok(w.slots.includes(a.s),`${id} slot ${a.s}`);
        const known=(A[id]||[]).some(i=>i.s===a.s&&i.n===a.n);assert.ok(known||(b.unverified||[]).includes(a.n),`${id} ${a.n} unknown and unflagged`)}}}
});
test('Warzone has a top loadout for every gun that has live stats',()=>{
  for(const w of g.weapons)if(w.live&&!['launcher','melee'].includes(w.cat))assert.ok(L.warzone[w.id],`${w.id} missing`);
});
test('Resurgence stays empty until verifiable loadouts exist',()=>{assert.equal(Object.keys(L.resurgence).length,0)});
test('loadouts file names no outside source',()=>{assert.ok(!/codmunity/i.test(fs.readFileSync('data/loadouts.json','utf-8')))});
