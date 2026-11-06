import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/profiles_schema.sql', 'utf8');
const js = readFileSync('profiles.js', 'utf8');
test('every profile table has row-level security and revoked default grants', () => {
  for (const t of ['ku_profiles', 'ku_shared_loadouts', 'ku_follows']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.match(sql, /revoke all on public\.ku_profiles, public\.ku_shared_loadouts, public\.ku_follows from anon, authenticated/);
});
test('writes are limited to the owner and anonymous users cannot write', () => {
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*to anon/i);
  assert.match(sql, /with check \(owner_id = auth\.uid\(\)\)/);
  assert.match(sql, /follower_id <> followee_id/);
});
test('no secret keys in the browser code or schema', () => {
  assert.doesNotMatch(js + sql, /service_role|sb_secret/i);
});
test('profile screen escapes user text', () => {
  assert.match(js, /esc\(p\.bio\)/);
  assert.match(js, /esc\(p\.username\)/);
});
