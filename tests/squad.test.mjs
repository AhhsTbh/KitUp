import test from 'node:test';import assert from 'node:assert';
const {parsePosts}=await import('../netlify/functions/lfg.mjs');
const now=Date.parse('2026-11-04T12:00:00Z');
const open={id:'1',timestamp:'2026-11-04T11:50:00Z',embeds:[{title:'☢️ DMZ · 2/4 · 🔎 Looking for a squad',description:'chill, mic on',fields:[{name:'Squad',value:'🎮 <@1> · KitTest#123\n🟩 <@2> · Other#456'}]}],components:[{components:[{custom_id:'kitup:lfg:join:dmz:4'}]}]};
test('open post is parsed and private IDs are not returned',()=>{const [p]=parsePosts([open],'G','C',now);assert.strictEqual(p.n,2);assert.strictEqual(p.slots,4);assert.strictEqual(p.minutesAgo,10);assert.deepStrictEqual(p.platforms,['🎮','🟩']);assert.strictEqual(p.url,'https://discord.com/channels/G/C/1');assert.ok(!JSON.stringify(p).includes('KitTest'))});
test('full, closed, expired and non-squad posts are skipped',()=>{const full={...open,id:'2',embeds:[{...open.embeds[0],title:'☢️ DMZ · 4/4 · ✅ Squad full'}]};const closed={...open,id:'3',components:[]};const old={...open,id:'4',timestamp:'2026-11-04T09:00:00Z'};assert.strictEqual(parsePosts([full,closed,old,{id:'5',embeds:[]}],'G','C',now).length,0)});
