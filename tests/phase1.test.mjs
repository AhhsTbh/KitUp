import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';import {execSync} from 'node:child_process';import {createRequire} from 'node:module';
const g=JSON.parse(fs.readFileSync('data/game.json','utf8'));const clicks=[];
globalThis.S={g};globalThis.window=globalThis;globalThis.document={addEventListener(t,f){if(t==='click')clicks.push(f)},createElement(){return{}},head:{appendChild(){}}};globalThis.go=()=>{};globalThis.scrollY=0;globalThis.scrollTo=()=>{};globalThis.renderHome=()=>'<div class="stack">';
createRequire(import.meta.url)('../lab.js');
test('Lab renders from real data with derived shots-to-kill',()=>{const h=renderLab();assert.match(h,/TTK vs range/);assert.match(h,/\d+stk/);assert.doesNotMatch(h,/undefined|NaN/)});
test('Lab no longer draws modeled recoil paths',()=>{const h=renderLab();assert.doesNotMatch(h,/DTW|polyline/);assert.match(h,/Measured recoil stats/)});
test('Patch solver applies a fire-rate change and re-ranks',()=>{clicks.forEach(f=>f({target:{dataset:{lab:'apply'}}}));const h=renderLab();assert.match(h,/✓/);assert.match(h,/Δ rank/);assert.match(h,/estimate/)});
test('Discord banner is on Home when invite is set',()=>{assert.match(renderHome(),/discord\.gg\//)});
test('SEO generator makes one valid page per gun',()=>{execSync('python3 tools/build_seo.py');const n=g.weapons.filter(w=>w.live&&w.live.ttk15).length;const p=fs.readFileSync('guns/han-86/index.html','utf8');assert.match(p,/rel="canonical" href="https:\/\/kitup\.gg\/guns\/han-86\/"/);assert.doesNotMatch(p,/undefined|NaN/);assert.strictEqual(fs.readdirSync('guns',{withFileTypes:true}).filter(d=>d.isDirectory()).length,n)});
