import test from 'node:test';import assert from 'node:assert';import fs from 'node:fs';
// index.html runs inside a wrapper, so lab.js and web-lfg.js only see S and go if index.html exposes them.
test('index.html exposes S and go for the Lab, Squad finder and web LFG scripts',()=>{
  const h=fs.readFileSync('index.html','utf8');
  assert.match(h,/window\.S = S;\s*window\.go = go;/);
  assert.ok(h.indexOf('window.S = S')<h.indexOf('<script src="lab.js">'));
});
