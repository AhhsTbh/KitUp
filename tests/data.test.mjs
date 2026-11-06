import test from 'node:test';import assert from 'node:assert';import {spawnSync} from 'node:child_process';
test('data files pass the validator (images exist, builds match attachments, no duplicates, sane stats)',t=>{
  const r=spawnSync('python3',['-I','tools/validate_data.py'],{encoding:'utf-8'});
  if(r.error){t.skip('python3 not available');return}
  assert.equal(r.status,0,r.stdout);
});
