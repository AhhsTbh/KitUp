/* Kit Up player profiles. Needs supabase/profiles_schema.sql applied to the Supabase project.
   Until then the screen shows a clear "setup needed" message and nothing else breaks.
   Uses only the public publishable key from window.KITUP_LFG_CONFIG; row-level security does the protecting. */
(() => {
  'use strict';
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const P = { sb: null, st: 'idle', user: null, me: null, shown: null, loadouts: [], following: false, followers: 0, feed: [], err: '', msg: '' };
  const K = () => window.KU;
  const esc = s => K().esc(s);
  const draw = () => { if (window.S && S.view === 'profile') { const v = document.getElementById('view'); if (v) { v.innerHTML = view(); } } };
  const explain = e => {
    const m = (e && e.message) || String(e || '');
    if (/relation .* does not exist|schema cache|ku_profiles/i.test(m)) return 'SETUP';
    if (/duplicate key|unique/i.test(m)) return 'That username is taken. Pick another.';
    return m || 'Something went wrong.';
  };
  async function client() {
    if (P.sb) return P.sb;
    const cfg = window.KITUP_LFG_CONFIG || {};
    if (!cfg.url || !cfg.publishableKey) throw new Error('Accounts are not configured.');
    if (!(window.supabase && window.supabase.createClient)) {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = LIB; s.onload = ok; s.onerror = () => no(new Error('Could not load the account library.')); document.head.appendChild(s); });
    }
    P.sb = window.supabase.createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return P.sb;
  }
  async function load(name) {
    P.st = 'loading'; P.err = ''; draw();
    try {
      const sb = await client();
      const { data: ses } = await sb.auth.getSession();
      P.user = (ses && ses.session && ses.session.user) || null;
      let mine = null;
      if (P.user) { const r = await sb.from('ku_profiles').select('*').eq('id', P.user.id).maybeSingle(); if (r.error) throw r.error; mine = r.data; }
      P.me = mine;
      P.shown = null; P.loadouts = []; P.feed = []; P.following = false; P.followers = 0;
      if (name === 'me') P.shown = mine;
      else { const r = await sb.from('ku_profiles').select('*').ilike('username', name).maybeSingle(); if (r.error) throw r.error; P.shown = r.data; }
      if (P.shown) {
        const id = P.shown.id;
        const l = await sb.from('ku_shared_loadouts').select('id,title,code,created_at').eq('owner_id', id).order('created_at', { ascending: false });
        if (l.error) throw l.error; P.loadouts = l.data || [];
        const c = await sb.from('ku_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', id);
        P.followers = c.count || 0;
        if (P.user && P.user.id !== id) { const f = await sb.from('ku_follows').select('followee_id').eq('follower_id', P.user.id).eq('followee_id', id); P.following = !!(f.data && f.data.length); }
      }
      if (P.me && name === 'me') await loadFeed();
      P.st = 'ready';
    } catch (e) { P.st = explain(e) === 'SETUP' ? 'setup' : 'error'; P.err = explain(e); }
    draw();
  }
  async function loadFeed() {
    const sb = P.sb;
    const f = await sb.from('ku_follows').select('followee_id').eq('follower_id', P.user.id);
    const ids = (f.data || []).map(x => x.followee_id); if (!ids.length) return;
    const l = await sb.from('ku_shared_loadouts').select('id,title,code,created_at,owner_id').in('owner_id', ids).order('created_at', { ascending: false }).limit(15);
    const names = await sb.from('ku_profiles').select('id,username').in('id', ids);
    const m = {}; (names.data || []).forEach(p => { m[p.id] = p.username; });
    P.feed = (l.data || []).map(x => Object.assign({ who: m[x.owner_id] || 'player' }, x));
  }
  function ldCard(x, own) {
    const L = K().decode(x.code); const gun = L && L.p && S.W[L.p.w];
    return `<div class="card"><div class="btn-row" style="align-items:center;justify-content:space-between"><div><b>${esc(x.title)}</b><div class="tiny">${gun ? esc(gun.name) : 'Loadout'}${x.who ? ' · by ' + esc(x.who) : ''}</div></div><div class="btn-row"><a class="btn ghost" href="#${esc(x.code)}">Open</a>${own ? `<button class="btn ghost" data-pf="del" data-id="${esc(x.id)}">Delete</button>` : ''}</div></div></div>`;
  }
  function view() {
    const h = (inner) => `<div class="eyebrow">KITUP / PLAYER PROFILE</div><h1 class="huge">PLAYER <span class="accent">PROFILE.</span></h1>${inner}`;
    if (P.st === 'idle' || P.st === 'loading') return h('<div class="card"><p class="tiny">Loading…</p></div>');
    if (P.st === 'setup') return h('<div class="card"><b>Profiles are not switched on yet.</b><p class="tiny">The site owner needs to run supabase/profiles_schema.sql once in the Supabase SQL editor. Nothing else is affected.</p></div>');
    if (P.st === 'error') return h(`<div class="card"><b>Could not load.</b><p class="tiny">${esc(P.err)}</p><button class="btn ghost" data-pf="retry">Try again</button></div>`);
    const msg = P.msg ? `<p class="tiny" role="status">${esc(P.msg)}</p>` : '';
    const ownView = S.profUser === 'me';
    if (ownView && !P.user) return h('<div class="card"><b>Sign in to make a profile.</b><p class="tiny">Use the account button at the top. It is the same account as the LFG board.</p></div>');
    if (ownView && !P.me) return h(`<div class="card"><b>Create your profile</b>${msg}${editor({ username: '', bio: '', avatar: '', favorites: [], is_public: true })}</div>`);
    if (!P.shown) return h('<div class="card"><b>No public profile with that name.</b></div>');
    const p = P.shown, own = P.user && P.user.id === p.id;
    const op = (S.g.operators || []).find(o => o.id === p.avatar);
    const favs = (p.favorites || []).map(id => S.W[id]).filter(Boolean);
    const head = `<div class="card"><div class="btn-row" style="align-items:center">${op ? `<img src="${esc(op.img)}" alt="" width="56" height="56" style="border-radius:50%;object-fit:cover">` : ''}<div><b style="font-size:1.2rem">@${esc(p.username)}</b>${p.is_public ? '' : ' <span class="tiny">(private)</span>'}<div class="tiny">${P.followers} follower${P.followers === 1 ? '' : 's'}</div></div></div>${p.bio ? `<p>${esc(p.bio)}</p>` : ''}${favs.length ? `<div class="tiny">Favorite guns: ${favs.map(g => esc(g.name)).join(', ')}</div>` : ''}${!own && P.user && P.me ? `<button class="btn ${P.following ? 'ghost' : ''}" data-pf="follow">${P.following ? 'Following' : 'Follow'}</button>` : ''}${!own && !P.user ? '<p class="tiny">Sign in to follow players.</p>' : ''}</div>`;
    const share = own ? `<div class="card"><b>Share a saved loadout</b>${(() => { const s = K().readSaved(); return s.length ? `<div class="btn-row"><select class="input" id="pf-save">${s.map((x, i) => `<option value="${i}">${esc(x.name || 'Loadout ' + (i + 1))}</option>`).join('')}</select><button class="btn" data-pf="share">Share</button></div>` : '<p class="tiny">Save a loadout in the Builder first.</p>'; })()}</div>` : '';
    const list = P.loadouts.length ? P.loadouts.map(x => ldCard(x, own)).join('') : '<div class="card"><p class="tiny">No shared loadouts yet.</p></div>';
    const feed = own && P.feed.length ? `<h2>From players you follow</h2>${P.feed.map(x => ldCard(x, false)).join('')}` : '';
    const edit = own ? `<details class="card"><summary><b>Edit profile</b></summary>${editor(p)}</details>` : '';
    return h(`${msg}${head}${edit}${share}<h2>Shared loadouts</h2>${list}${feed}${own ? `<p class="tiny">Your profile link: #u-${esc(p.username)}</p>` : ''}`);
  }
  function editor(p) {
    const ops = (S.g.operators || []);
    const guns = Object.values(S.W).sort((a, b) => a.name.localeCompare(b.name));
    return `<form data-pf="save" style="display:grid;gap:10px"><label>Username (3-20 letters, numbers, _)<input class="input" name="username" required pattern="[a-z0-9_]{3,20}" maxlength="20" value="${esc(p.username)}"></label><label>Bio (160 max)<textarea class="input" name="bio" maxlength="160" rows="2">${esc(p.bio)}</textarea></label><label>Operator picture<select class="input" name="avatar"><option value="">None</option>${ops.map(o => `<option value="${esc(o.id)}"${o.id === p.avatar ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label><label>Favorite guns (up to 12)<select class="input" name="favorites" multiple size="6">${guns.map(g => `<option value="${esc(g.id)}"${(p.favorites || []).includes(g.id) ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label><label><input type="checkbox" name="is_public"${p.is_public ? ' checked' : ''}> Public profile (anyone can see it)</label><button class="btn" type="submit">Save profile</button></form>`;
  }
  async function act(fn) { try { P.msg = ''; await fn(); } catch (e) { P.msg = explain(e); } draw(); }
  document.addEventListener('submit', e => {
    const f = e.target.closest && e.target.closest('form[data-pf="save"]'); if (!f) return; e.preventDefault();
    act(async () => {
      const d = new FormData(f);
      const row = { username: String(d.get('username') || '').toLowerCase().trim(), bio: String(d.get('bio') || '').trim().slice(0, 160), avatar: String(d.get('avatar') || ''), favorites: d.getAll('favorites').slice(0, 12), is_public: d.get('is_public') === 'on' };
      const r = P.me ? await P.sb.from('ku_profiles').update(row).eq('id', P.user.id) : await P.sb.from('ku_profiles').insert(Object.assign({ id: P.user.id }, row));
      if (r.error) throw r.error;
      await load('me'); P.msg = 'Saved.';
    });
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-pf]'); if (!b || b.tagName === 'FORM') return;
    const a = b.dataset.pf;
    if (a === 'retry') load(S.profUser);
    if (a === 'follow') act(async () => {
      const r = P.following ? await P.sb.from('ku_follows').delete().eq('follower_id', P.user.id).eq('followee_id', P.shown.id) : await P.sb.from('ku_follows').insert({ followee_id: P.shown.id });
      if (r.error) throw r.error; P.following = !P.following; P.followers += P.following ? 1 : -1;
    });
    if (a === 'del') act(async () => { const r = await P.sb.from('ku_shared_loadouts').delete().eq('id', b.dataset.id); if (r.error) throw r.error; P.loadouts = P.loadouts.filter(x => x.id !== b.dataset.id); });
    if (a === 'share') act(async () => {
      const s = K().readSaved()[+document.getElementById('pf-save').value]; if (!s) return;
      const r = await P.sb.from('ku_shared_loadouts').insert({ title: String(s.name || 'Loadout').slice(0, 40), code: K().encode(s) });
      if (r.error) throw r.error; await load('me'); P.msg = 'Shared.';
    });
  });
  function mountBtn() {
    if (document.getElementById('ku-prof')) return true;
    const r = document.querySelector('.top-r'); if (!r || !window.S || !S.g) return false;
    const b = document.createElement('button'); b.className = 'theme-b'; b.id = 'ku-prof'; b.setAttribute('aria-label', 'Player profile'); b.dataset.go = 'me';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 18c.8-2.2 2.6-3.2 5-3.2s4.2 1 5 3.2"/></svg>';
    r.insertBefore(b, r.firstChild); return true;
  }
  let tries = 0; const t = setInterval(() => { if (mountBtn() || ++tries > 40) clearInterval(t); }, 250);
  window.KuProfiles = { view, reload: n => load(n) };
})();
