/* Kit Up Gunsmith: turns a plain-English request into a build.
   No servers, no API: it reads your sentence with keyword rules and scores each gun's real attachments by the
   stat changes listed in data/attachments.json and data/game.json. It never invents a number. */
(function (root) {
'use strict';

/* ---------- engine (pure, no page globals) ---------- */

// Which attachment stat belongs to which goal group, and how much of that group's weight it gets.
const STAT = {
  'Vertical Recoil': ['recoil', .25], 'Horizontal Recoil': ['recoil', .25], 'Vertical Gun Kick': ['recoil', .25], 'Horizontal Gun Kick': ['recoil', .25], 'Gun Kick': ['recoil', .25],
  'ADS Speed': ['ads', .8], 'ADS Out Speed': ['ads', .2],
  'Range': ['range', 1],
  'Movement': ['mob', .2], 'Strafe Speed': ['mob', .15], 'Firing Move Speed': ['mob', .15], 'Sprint': ['mob', .15], 'Tactical Sprint Speed': ['mob', .15], 'Crouch Movement': ['mob', .05], 'ADS Movement': ['mob', .15],
  'Sprint To Fire': ['stf', 1],
  'ADS Idle Sway': ['sway', .6], 'ADS Gun Bob': ['sway', .4],
  'Hip Idle Sway': ['hip', .4], 'Hip Gun Bob': ['hip', .4], 'Hip Turn Sway': ['hip', .2],
  'Bullet Velocity': ['vel', 1],
  'Flinch Received': ['flinch', 1],
  'Magazine Size': ['mag', .4], 'Reserves': ['mag', .2], 'Reload Speed': ['mag', .3], 'Rechambering Speed': ['mag', .1],
  'Head Damage Multiplier': ['head', 1],
  'Bullet Penetration': ['pen', 1],
  'Fire Rate': ['fire', 1],
  'Raise Speed': ['raise', .5], 'Drop Speed': ['raise', .5]
};
// Zoom Level is deliberately not scored: a +600% zoom would drown every real stat.

// Goals people ask for. g = weight on attachment stat groups, b = weight on the base gun's own numbers (lower is better unless noted).
const GOALS = {
  recoil:   { label: 'Low recoil',        re: /recoil|control|steady|stable|no kick|laser beam|kick/, g: { recoil: 3, sway: .5 }, b: { vRecoil: 2, hRecoil: 1.5 } },
  ads:      { label: 'Fast ADS',          re: /\bads\b|aim(ing)? speed|aim down|fast aim|quick aim|quickscope|quick scope/, g: { ads: 3 }, b: { ads: 3 } },
  range:    { label: 'Damage range',      re: /damage range|long[- ]?range|\brange\b|distance|far away|\blong\b/, g: { range: 3, vel: 1 }, b: { ttk80: 2, ttk40: 1, vel: 1 } },
  rush:     { label: 'Rushing',           re: /rush|aggressive|close|run and gun|run-and-gun|cqb|slay|push|spawn|sweat/, g: { mob: 2.5, ads: 1.5, hip: 1.5, stf: 3 }, b: { stf: 2, tac: 1.5, ads: 1.5, ttk15: 2 } },
  mobility: { label: 'Mobility',          re: /mobil|movement|strafe|sprint|agile/, g: { mob: 3, stf: 1.5 }, b: { tac: 2, move: 1.5, stf: 1 } },
  accuracy: { label: 'Accuracy',          re: /accura|sway|precis|pinpoint/, g: { sway: 2.5, recoil: 1 }, b: { sway: 2 } },
  ranked:   { label: 'Ranked / competitive', re: /ranked|competitive|\bcomp\b|tournament|scrim|\bcdl\b|league/, g: { recoil: 2, ads: 2, range: 1.5, mob: 1, flinch: 1 }, b: { ttk15: 1, ttk40: 1, vRecoil: 1, ads: 1 } },
  head:     { label: 'Headshot damage',   re: /head ?shot|head damage|headshots/, g: { head: 3 }, b: {} },
  damage:   { label: 'Good damage',       re: /damage|kill speed|\bttk\b|time to kill|fast kill|hard[- ]hitting|hits hard/, g: {}, b: { ttk15: 2, ttk40: 2 } },
  ammo:     { label: 'Ammo and reloads',  re: /ammo|\bmag\b|magazine|reload|capacity|sustain/, g: { mag: 2 }, b: {} }
};
const GOAL_ORDER = ['ranked', 'recoil', 'ads', 'range', 'rush', 'mobility', 'accuracy', 'head', 'damage', 'ammo'];
const CLASSES = [
  ['ar', /assault rifle|\bars?\b/], ['smg', /\bsmgs?\b|submachine|sub machine/], ['lmg', /\blmgs?\b|light machine|machine gun/],
  ['mr', /marksman|\bdmr\b/], ['sr', /sniper/], ['sg', /shotgun/], ['pistol', /pistol|sidearm|secondary/]
];
const TIER_N = { S: 1, A: .7, B: .4, '2nd': .3 };

const ID = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Read a sentence: which goals, which class, which named guns. */
function parseRequest(text, weapons) {
  let t = ' ' + String(text || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  const nameRe = w => new RegExp('(^|[^a-z0-9])' + String(w.name).toLowerCase().replace(/[^a-z0-9]+/g, '[^a-z0-9]*').replace(/^(\[\^a-z0-9\]\*)+|(\[\^a-z0-9\]\*)+$/g, '') + '($|[^a-z0-9])');
  const named = (weapons || []).filter(w => nameRe(w).test(t));
  let rest = t;
  named.forEach(w => { rest = rest.replace(nameRe(w), ' '); });
  rest = rest.replace(/damage range/g, ' range ');
  const goals = GOAL_ORDER.filter(k => GOALS[k].re.test(k === 'range' ? t : rest));
  const cls = (CLASSES.find(([, re]) => re.test(rest)) || [])[0] || null;
  const meta = /\bmeta\b|\bbest\b|\btop\b|strongest|\bop\b/.test(t);
  return { goals, cls, named, meta, text: String(text || '') };
}

/** Per-stat weights for a set of goals. Stats nobody asked about keep a small weight so trade-offs still count. */
function weightsFor(goals, norm) {
  const grp = {};
  (goals.length ? goals : ['ranked']).forEach(k => { Object.entries(GOALS[k].g).forEach(([g, w]) => { grp[g] = (grp[g] || 0) + w; }); });
  const w = {};
  Object.entries(STAT).forEach(([name, [g, share]]) => { w[name] = (grp[g] != null ? grp[g] : .15) * share * (norm && norm[g] ? norm[g] : 1); });
  return w;
}

/** Some stats move a lot (range, velocity) and some a little (ADS speed). Scale each group by how big its changes usually are in the data,
    so asking for fast ADS isn't drowned out by range changes that are simply bigger numbers. */
function groupNorm(attachments) {
  const sum = {}, n = {};
  Object.values(attachments || {}).forEach(list => list.forEach(it => (it.u || []).concat(it.d || []).forEach(t => {
    const e = eff(t); if (!e || !STAT[e.stat]) return;
    const g = STAT[e.stat][0]; sum[g] = (sum[g] || 0) + Math.min(Math.abs(e.pct), 60); n[g] = (n[g] || 0) + 1;
  })));
  const mean = {}; let tot = 0, c = 0;
  Object.keys(sum).forEach(g => { mean[g] = sum[g] / n[g]; tot += mean[g]; c++; });
  const ref = c ? tot / c : 1, out = {};
  Object.keys(mean).forEach(g => { out[g] = ref / mean[g]; });
  return out;
}

const eff = t => {
  const m = /^([-+]?\d+(?:\.\d+)?)(%?)\s+(.+)$/.exec(String(t));
  return m && m[2] ? { pct: parseFloat(m[1]), stat: m[3].trim() } : null;
};

/** Score one attachment. Listed upsides add, listed downsides subtract, each weighted by what you asked for. */
function scoreAttachment(item, weights) {
  let s = 0;
  const part = (list, sign) => (list || []).forEach(t => {
    const e = eff(t); if (!e) return;
    const w = weights[e.stat]; if (!w) return;
    s += sign * w * Math.min(Math.abs(e.pct), 60);
  });
  part(item.u, 1); part(item.d, -1);
  return s;
}

/** Best attachment per slot, then the strongest slots up to the attachment limit. Apex isn't scored (no stat data for it). */
function pickBuild(w, items, weights, limit, locked) {
  const bySlot = {}, keep = [], dropped = [], used = new Set();
  // Build Lock: keep locked attachments only if they are real for this gun, in a real slot, one per slot, within the limit.
  (locked || []).forEach(l => {
    const it = (items || []).find(x => x.s === l.s && x.n === l.n);
    if (!it || !w.slots.includes(l.s) || used.has(l.s) || keep.length >= limit) { dropped.push(l); return; }
    used.add(l.s); keep.push({ it, score: scoreAttachment(it, weights), locked: true });
  });
  (items || []).forEach(it => {
    if (!w.slots.includes(it.s) || used.has(it.s)) return;
    const sc = scoreAttachment(it, weights);
    if (!bySlot[it.s] || sc > bySlot[it.s].score) bySlot[it.s] = { it, score: sc };
  });
  const free = Object.values(bySlot).filter(x => x.score > 0.5).sort((a, b) => b.score - a.score).slice(0, limit - keep.length);
  const picks = keep.concat(free);
  const order = w.slots;
  picks.sort((a, b) => order.indexOf(a.it.s) - order.indexOf(b.it.s));
  return { att: picks.map(x => ({ s: x.it.s, n: x.it.n })), score: picks.reduce((s, x) => s + x.score, 0), picks, dropped };
}

/** Plain-language reasons for one pick, straight from its listed changes. */
function reasons(item, weights) {
  const rows = [];
  const add = (list, good) => (list || []).forEach(t => {
    const e = eff(t); if (!e || !weights[e.stat]) return;
    rows.push({ t: `${e.stat} ${e.pct > 0 ? '+' : '−'}${Math.abs(e.pct).toFixed(Math.abs(e.pct) % 1 ? 1 : 0)}%`, good, w: weights[e.stat] * Math.min(Math.abs(e.pct), 60) });
  });
  add(item.u, true); add(item.d, false);
  const ups = rows.filter(r => r.good).sort((a, b) => b.w - a.w).slice(0, 2);
  const dn = rows.filter(r => !r.good).sort((a, b) => b.w - a.w).slice(0, 1);
  return { ups: ups.map(r => r.t), dn: dn.map(r => r.t) };
}

const pctile = (v, arr, lowGood) => {
  const xs = arr.filter(x => x != null); if (xs.length < 2 || v == null) return .5;
  const better = xs.filter(x => (lowGood ? x > v : x < v)).length;
  return better / (xs.length - 1);
};
const LOW_GOOD = { vRecoil: 1, hRecoil: 1, ads: 1, stf: 1, ttk15: 1, ttk40: 1, ttk80: 1, sway: 1, tac: 0, move: 0, vel: 0 };

/** Rank guns for a request. Returns best first, each with its build. */
function recommend(req, data) {
  const { weapons, attachments, tiers, limit = 5, meta = [], locked = {} } = data;
  const tierOf = id => { for (const t of (tiers && tiers.tiers) || []) if (t.ids.includes(id)) return t.t; return ''; };
  const skip = new Set(['launcher', 'melee']);
  let pool;
  if (req.named.length) pool = req.named.filter(w => w.live);
  else if (req.cls) pool = weapons.filter(w => w.cat === req.cls && w.live);
  else pool = weapons.filter(w => !skip.has(w.cat) && w.cat !== 'pistol' && w.live);
  const goals = req.goals.length ? req.goals : ['ranked'];
  const weights = weightsFor(goals, groupNorm(attachments));
  const bw = {};
  goals.forEach(k => Object.entries(GOALS[k].b).forEach(([s, v]) => { bw[s] = (bw[s] || 0) + v; }));
  if (!Object.keys(bw).length) { bw.ttk15 = 1; bw.ttk40 = 1; }
  const wantsMobile = goals.some(k => k === 'rush' || k === 'mobility' || k === 'ads');
  const built = pool.map(w => {
    const b = pickBuild(w, attachments[w.id] || [], weights, limit, locked[w.id]);
    if (!b.att.length) {
      // Some guns (snipers, marksman rifles, pistols) have no attachment stat data to score, so use the live meta build instead of guessing.
      const ms = meta.filter(m => m.w === w.id && !m.apex && m.att && m.att.length);
      const m = (wantsMobile && ms.find(x => /Mobility/.test(x.name))) || ms[0];
      if (m) return { w, build: { att: m.att.map(a => ({ s: a.s, n: a.n })), score: 0, picks: m.att.map(a => ({ it: { s: a.s, n: a.n, u: [], d: [] }, score: 0 })), fromMeta: m.name } };
    }
    return { w, build: b };
  });
  const scores = built.filter(x => !x.build.fromMeta).map(x => x.build.score), lo = scores.length ? Math.min(...scores) : 0, hi = scores.length ? Math.max(...scores) : 0;
  const tw = req.meta || goals.includes('ranked') ? .3 : .15;
  const totalB = Object.values(bw).reduce((a, b) => a + b, 0) || 1;
  built.forEach(x => {
    const l = x.w.live;
    const fit = Object.entries(bw).reduce((s, [k, v]) => {
      return s + v * pctile(l[k], pool.map(p => p.live[k]), !!LOW_GOOD[k]);
    }, 0) / totalB;
    const buildFit = x.build.fromMeta ? .5 : hi > lo ? (x.build.score - lo) / (hi - lo) : .5;
    const tier = tierOf(x.w.id);
    const tierN = TIER_N[tier] != null ? TIER_N[tier] : .15;
    x.tier = tier; x.fit = fit; x.buildFit = buildFit;
    x.score = Math.round(100 * clamp((1 - tw) * (.55 * fit + .45 * buildFit) + tw * tierN, 0, 1));
  });
  built.sort((a, b) => b.score - a.score || a.w.name.localeCompare(b.w.name));
  return { goals, weights, results: built.filter(x => x.build.att.length).slice(0, 3) };
}

/** Kill-time estimates. Theoretical = every shot lands. Practical = only `acc` of shots land (a stated assumption, not measured gameplay). */
function shotsToKill(ttkMs, rpm) { return ttkMs == null || !rpm ? null : Math.round(ttkMs * rpm / 60000) + 1; }
function practicalTTK(ttkMs, rpm, acc) {
  const n = shotsToKill(ttkMs, rpm); if (n == null || !(acc > 0)) return null;
  return Math.round((n / acc - 1) * 60000 / rpm);
}

/** 1v1 duel simulation. Not match data: a stated-assumptions model.
 *  Each side: { ttk:[15m,40m,80m,100m ms], rpm, ads }. Opts: dist (m), acc/react per side, pre = already aimed in.
 *  Finish time = reaction + (ADS time unless already aimed) + practical TTK at the distance. Lowest finish wins. */
const RNG = [15, 40, 80, 100];
const ttkAtRange = (t, r) => { if (r <= 15) return t[0]; for (let i = 1; i < 4; i++) if (r <= RNG[i]) return t[i - 1] + (t[i] - t[i - 1]) * (r - RNG[i - 1]) / (RNG[i] - RNG[i - 1]); return t[3]; };
function finishTime(side, o) {
  const th = ttkAtRange(side.ttk, o.dist), pr = practicalTTK(th, side.rpm, o.acc);
  if (pr == null) return null;
  return { start: o.react + (o.pre ? 0 : side.ads), theoretical: Math.round(th), practical: pr, total: Math.round(o.react + (o.pre ? 0 : side.ads) + pr), ads: o.pre ? 0 : side.ads };
}
function duel(a, b, o) {
  const A = finishTime(a, { dist: o.dist, acc: o.accA, react: o.reactA, pre: o.preA }), B = finishTime(b, { dist: o.dist, acc: o.accB, react: o.reactB, pre: o.preB });
  if (!A || !B) return null;
  const youWin = A.total <= B.total, margin = Math.abs(A.total - B.total), flips = {};
  if (!youWin) {
    flips.react = Math.min(o.reactA, margin + 1);                     // ms faster reaction that would win
    for (let acc = Math.round(o.accA * 100) + 1; acc <= 100; acc++) { const t = finishTime(a, { dist: o.dist, acc: acc / 100, react: o.reactA, pre: o.preA }); if (t && t.total <= B.total) { flips.acc = acc; break; } }
    if (!o.preA && finishTime(a, { dist: o.dist, acc: o.accA, react: o.reactA, pre: true }).total <= B.total) flips.preAim = true;
  }
  return { you: A, enemy: B, youWin, margin, flips };
}
const api = { duel, ttkAtRange, parseRequest, weightsFor, groupNorm, scoreAttachment, pickBuild, reasons, recommend, shotsToKill, practicalTTK, GOALS, STAT };
root.GunsmithEngine = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof document === 'undefined' || !document.addEventListener) return;

/* ---------- page UI (uses the app's own helpers) ---------- */
const E = api;
const U = new Proxy({}, { get: (_, k) => window.KU && window.KU[k] });
const G = { text: '', res: null, cmp: null, acc: 65, note: '', locks: {} };
const EXAMPLES = [
  'Best low recoil assault rifle for ranked with fast ADS and good damage range',
  'Aggressive rushing SMG with fast sprint to fire',
  'Long range accuracy LMG',
  'Han 86 low recoil'
];
function css() {
  if (document.getElementById('gs-css')) return;
  const s = document.createElement('style'); s.id = 'gs-css';
  s.textContent = `.gs{display:grid;gap:12px}.gs-q{width:100%;box-sizing:border-box;min-height:84px;resize:vertical;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--raised);color:var(--ink);font:16px/1.4 var(--f-body,inherit)}
.gs-q:focus{outline:2px solid var(--accent);outline-offset:1px}.gs-ex{display:flex;gap:6px;flex-wrap:wrap}.gs-ex button{border:1px solid var(--line);background:var(--raised);color:var(--ink);border-radius:999px;padding:8px 12px;font:600 .72rem/1.2 var(--f-body,inherit);min-height:36px;text-align:left;cursor:pointer}
.gs-goals{display:flex;gap:6px;flex-wrap:wrap}.gs-goals span{border-radius:999px;padding:5px 10px;background:color-mix(in srgb,var(--accent) 16%,var(--raised));border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line));font:700 .66rem/1 var(--f-body,inherit);letter-spacing:.04em;text-transform:uppercase}
.gs-res{display:grid;gap:12px}.gs-gun{display:grid;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--line);background:var(--surface)}
.gs-top{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center}.gs-top img{width:96px;height:auto;max-width:100%}.gs-top h3{margin:0;font-size:1.05rem}
.gs-score{display:grid;justify-items:center;padding:6px 10px;border-radius:10px;background:var(--raised);border:1px solid var(--line)}.gs-score b{font:800 1.3rem/1 var(--f-display,inherit);color:var(--accent-text,var(--ink))}.gs-score small{font-size:.58rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.gs-att{list-style:none;margin:0;padding:0;display:grid;gap:8px}.gs-att li{display:grid;gap:3px;padding:8px 0;border-bottom:1px dashed var(--line)}.gs-att li:last-child{border-bottom:0}
.gs-att .r1{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.gs-att .r1 span{font:700 .62rem/1 var(--f-body,inherit);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.gs-att .r1 b{font-size:.92rem;text-align:right}
.gs-why{display:flex;gap:6px;flex-wrap:wrap;font-size:.72rem}.gs-why i{font-style:normal;padding:2px 7px;border-radius:6px}.gs-why .up{background:color-mix(in srgb,var(--buff,#3DDC97) 16%,transparent);color:var(--buff,#3DDC97)}.gs-why .dn{background:color-mix(in srgb,var(--nerf,#FF6B6B) 16%,transparent);color:var(--nerf,#FF6B6B)}
.gs-btns{display:flex;gap:8px;flex-wrap:wrap}.gs-btns .btn{flex:1 1 auto;min-height:44px}
.gs-cmp{display:grid;gap:8px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--raised)}.gs-cmp table{width:100%;border-collapse:collapse;font-size:.8rem}.gs-cmp th,.gs-cmp td{padding:6px 4px;border-bottom:1px dashed var(--line);text-align:right}.gs-cmp th:first-child,.gs-cmp td:first-child{text-align:left;color:var(--muted)}.gs-cmp td.win{color:var(--buff,#3DDC97);font-weight:800}
.gs-lock{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:14px;margin-left:auto}.gs-lock.on{border-color:var(--accent);color:var(--accent-text)}.gs-cmp select{min-height:40px;font-size:16px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:0 8px}`;
  document.head.appendChild(s);
}

const gdata = () => ({ weapons: S.g.weapons, attachments: S.A || {}, tiers: S.tiers, limit: U.limit(), meta: S.meta || [], locked: G.locks });
const nameOf = id => (S.W[id] || {}).name || id;

function run(text) {
  G.text = text; G.cmp = null; G.note = '';
  if (!text.trim()) { G.res = null; G.note = 'Type what you want: a gun type, a playstyle, or a gun name.'; return; }
  const req = E.parseRequest(text, S.g.weapons);
  const out = E.recommend(req, gdata());
  G.req = req;
  if (!out.results.length) { G.res = null; G.note = req.cls === 'pistol' ? 'No pistol attachment data matched that. Try naming a gun.' : "I couldn't build anything from that. Try a gun type or name, like \"low recoil SMG\" or \"Kastov 762 fast ADS\"."; return; }
  G.res = out;
  if (!req.goals.length) G.note = "I didn't catch a playstyle, so I built a balanced ranked-style set (recoil, ADS speed, range). Add words like low recoil, fast ADS, rushing or long range to steer it.";
}

function chipsFor(w, att) { return U.buildChips ? U.buildChips({ w: w.id, att }) : ''; }

function cmpHTML(i) {
  const x = G.res.results[i], w = x.w;
  const meta = (S.meta || []).find(m => m.w === w.id && !m.alt && !m.side);
  const cur = S.L && S.L.p && S.L.p.w === w.id && S.L.p.att.length ? { name: 'Your loadout', att: S.L.p.att } : null;
  const other = cur || (meta ? { name: 'Live meta build', att: meta.att } : null);
  if (!other) return `<div class="gs-cmp"><p class="small muted">There's no meta build or saved loadout on the ${U.esc(w.name)} to compare with yet.</p></div>`;
  const A = U.buildStats({ w: w.id, att: x.build.att }), B = U.buildStats({ w: w.id, att: other.att });
  if (!A || !B) return '';
  const keys = [...new Set(A.rows.concat(B.rows).map(r => r.k))];
  const val = (S_, k) => { const r = S_.rows.find(r => r.k === k); return r ? r : { base: w.live[k], val: w.live[k], fmt: (U.BS_ROWS.find(b => b[0] === k) || [])[4] || (v => String(v)) }; };
  const lowGood = k => !!(U.BS_ROWS.find(b => b[0] === k) || [])[3];
  const rows = keys.map(k => {
    const a = val(A, k), b = val(B, k), f = a.fmt || b.fmt || (v => String(v));
    const aw = lowGood(k) ? a.val < b.val : a.val > b.val, bw = lowGood(k) ? b.val < a.val : b.val > a.val;
    return `<tr><td>${U.esc(((U.BS_ROWS.find(r => r[0] === k)) || [k, k])[1])}</td><td class="${aw ? 'win' : ''}">${f(a.val)}</td><td class="${bw ? 'win' : ''}">${f(b.val)}</td></tr>`;
  }).join('');
  const l = w.live, rpmA = (A.rows.find(r => r.k === 'rpm') || { val: l.rpm }).val, rpmB = (B.rows.find(r => r.k === 'rpm') || { val: l.rpm }).val;
  const adj = (t, base, now) => t == null ? null : Math.round(t * base / now);
  const t15A = adj(l.ttk15, l.rpm, rpmA), t15B = adj(l.ttk15, l.rpm, rpmB), t40A = adj(l.ttk40, l.rpm, rpmA), t40B = adj(l.ttk40, l.rpm, rpmB);
  const acc = G.acc / 100;
  const pr = (t, rpm) => t == null ? null : E.practicalTTK(t, rpm, acc);
  const ms = v => v == null ? '–' : v + ' ms';
  const trow = (lab, a, b) => `<tr><td>${lab}</td><td class="${a != null && b != null && a < b ? 'win' : ''}">${ms(a)}</td><td class="${a != null && b != null && b < a ? 'win' : ''}">${ms(b)}</td></tr>`;
  return `<div class="gs-cmp">
    <table><thead><tr><th></th><th>Gunsmith</th><th>${U.esc(other.name)}</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No stat differences listed.</td></tr>'}
    ${trow('Theoretical TTK up close', t15A, t15B)}${trow('Theoretical TTK mid range', t40A, t40B)}
    ${trow(`Practical TTK close · ${G.acc}% hits`, pr(t15A, rpmA), pr(t15B, rpmB))}${trow(`Practical TTK mid · ${G.acc}% hits`, pr(t40A, rpmA), pr(t40B, rpmB))}</tbody></table>
    <label class="small muted">Hit rate for practical TTK <select data-gs="acc" data-i="${i}" aria-label="Hit rate">${[40, 50, 65, 80, 95].map(a => `<option value="${a}"${a === G.acc ? ' selected' : ''}>${a}%</option>`).join('')}</select></label>
    <p class="small muted">Theoretical means every shot lands, from the live base numbers with fire rate changes applied. Practical is an estimate that only counts the share of shots you choose to land, not measured gameplay. Damage range changes from attachments aren't in the kill times. ${U.esc(S.g.meta.label || 'Modern Warfare 4')} data, updated ${U.esc(U.fmtDay(S.g.meta.liveUpdated))}.</p>
  </div>`;
}

function gunHTML(x, i) {
  const w = x.w, wt = G.res.weights;
  const items = S.A[w.id] || [];
  const lis = x.build.picks.map(p => {
    const r = E.reasons(p.it, wt);
    const lk = !!p.locked;
    return `<li><div class="r1"><span>${U.esc(p.it.s)}</span><b>${U.esc(p.it.n)}</b><button type="button" class="gs-lock${lk ? ' on' : ''}" data-gs="lock" data-w="${U.esc(w.id)}" data-s="${U.esc(p.it.s)}" data-n="${U.esc(p.it.n)}" aria-pressed="${lk}" aria-label="${lk ? 'Unlock' : 'Lock'} ${U.esc(p.it.n)}">${lk ? 'Locked' : 'Lock'}</button></div><div class="gs-why">${r.ups.map(t => `<i class="up">${U.esc(t)}</i>`).join('')}${r.dn.map(t => `<i class="dn">${U.esc(t)}</i>`).join('')}</div></li>`;
  }).join('');
  const tm = U.tierMark ? U.tierMark(w.id) : '';
  return `<article class="gs-gun">
    <div class="gs-top"><button class="plate" data-gun="${U.esc(w.id)}" aria-label="${U.esc(w.name)} details">${U.gunPic ? U.gunPic(w) : ''}</button>
      <div><h3>${U.esc(w.name)} ${tm}</h3><p class="small muted">${U.esc((S.C[w.cat] || {}).one || '')} · ${x.build.att.length} attachments</p></div>
      <div class="gs-score" title="How well this gun and build fit your request, from the live data"><b>${x.score}</b><small>Fit</small></div></div>
    ${x.build.dropped && x.build.dropped.length ? `<p class="small muted">Couldn't keep ${U.esc(x.build.dropped.map(d => d.n).join(', '))}: not available for this gun or over the attachment limit.</p>` : ''}
    ${x.build.fromMeta ? `<p class="small muted">There's no attachment stat data for the ${U.esc(w.name)} yet, so this is the live meta build (${U.esc(x.build.fromMeta)}) instead of a custom pick.</p>` : ''}
    <ul class="gs-att">${lis}</ul>
    ${chipsFor(w, x.build.att)}
    <div class="gs-btns"><button class="btn" data-gs="apply" data-i="${i}">Use this build</button><button class="btn ghost" data-gs="cmp" data-i="${i}">${G.cmp === i ? 'Hide compare' : 'Compare'}</button></div>
    <div class="gs-btns"><button class="btn ghost sm" data-gs="save" data-i="${i}">Save</button><button class="btn ghost sm" data-gs="share" data-i="${i}">Share code</button><button class="btn ghost sm" data-gs="card" data-i="${i}">Gun card</button></div>
    ${G.cmp === i ? cmpHTML(i) : ''}
  </article>`;
}

function card() {
  css();
  const req = G.req, goals = G.res ? G.res.goals : [];
  return `<section class="sec gs" id="gunsmith">
    <div><p class="eyebrow">Gunsmith</p><h2 class="h">Build it from a sentence</h2><p class="sub">Say the gun or type, and what matters. It picks real attachments by their listed stat changes.</p></div>
    <textarea id="gs-q" class="gs-q" data-gs="text" rows="3" maxlength="200" placeholder="Best low recoil assault rifle for ranked with fast ADS and good damage range" aria-label="Describe the build you want">${U.esc(G.text)}</textarea>
    <div class="gs-ex">${EXAMPLES.map((t, i) => `<button type="button" data-gs="ex" data-i="${i}">${U.esc(t)}</button>`).join('')}</div>
    <button class="btn" data-gs="run">Build it</button>
    ${G.note ? `<p class="small muted">${U.esc(G.note)}</p>` : ''}
    ${G.res ? `<div class="gs-goals" aria-label="What I understood">${goals.map(k => `<span>${U.esc(E.GOALS[k].label)}</span>`).join('')}${req && req.cls ? `<span>${U.esc((S.C[req.cls] || {}).name || req.cls)}</span>` : ''}${req && req.named.length ? `<span>${U.esc(req.named.map(w => w.name).join(', '))}</span>` : ''}</div>
    <div class="gs-res" id="gs-res">${G.res.results.map(gunHTML).join('')}</div>
    <p class="small muted">Fit combines how the gun's own numbers suit your request, how well its best attachments do, and its live meta tier. Apex attachments aren't scored because there's no stat data for them. Nothing here is a guess at hidden numbers.</p>` : ''}
  </section>`;
}

function loadoutWith(i) {
  const x = G.res.results[i], L = JSON.parse(JSON.stringify(S.L));
  const slot = { w: x.w.id, att: x.build.att.map(a => ({ s: a.s, n: a.n })), apex: false };
  if (U.cls(x.w) === 'secondary') L.s = slot; else L.p = slot;
  L.name = (`Gunsmith ${x.w.name}`).slice(0, 40);
  return U.sanitize(L);
}
function again(scroll) { U.rerenderBuild(); if (scroll) { const el = document.getElementById(scroll); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }

document.addEventListener('input', e => { if (e.target && e.target.id === 'gs-q') G.text = e.target.value; });
document.addEventListener('change', e => {
  const t = e.target && e.target.closest && e.target.closest('[data-gs="acc"]');
  if (t) { G.acc = Number(t.value) || 65; again(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button[data-gs]'); if (!t) return;
  const a = t.dataset.gs, i = Number(t.dataset.i);
  if (a === 'run') { const q = document.getElementById('gs-q'); run(q ? q.value : G.text); again('gs-res'); }
  else if (a === 'ex') { run(EXAMPLES[i]); again('gs-res'); }
  else if (a === 'lock') {
    const { w, s: sl, n } = t.dataset, cur = G.locks[w] || [], has = cur.some(l => l.s === sl && l.n === n);
    G.locks[w] = has ? cur.filter(l => !(l.s === sl && l.n === n)) : cur.filter(l => l.s !== sl).concat({ s: sl, n });
    if (G.req) { const out = E.recommend(G.req, gdata()); if (out.results.length) G.res = out; }
    again();
  }
  else if (a === 'cmp') { G.cmp = G.cmp === i ? null : i; again(); }
  else if (a === 'apply') { S.L = loadoutWith(i); again(); window.scrollTo(0, 0); U.toast(`Loaded ${G.res.results[i].w.name} build`); }
  else if (a === 'save') {
    const L = loadoutWith(i), s = U.readSaved().filter(v => v.name !== L.name);
    s.unshift({ name: L.name, code: U.encode(L), at: Date.now() });
    U.toast(U.writeSaved(s.slice(0, 30)) ? `Saved "${L.name}"` : "This browser won't save. Use Share code instead.");
  } else if (a === 'share') {
    const code = U.encode(loadoutWith(i)), text = location.origin + location.pathname + '#' + code;
    try { navigator.clipboard.writeText(text).then(() => U.toast('Share code copied'), () => U.toast(text)); } catch (err) { U.toast(text); }
  } else if (a === 'card') {
    const x = G.res.results[i]; U.openGunCard({ w: x.w.id, att: x.build.att.slice(), apex: false });
  }
});

root.Gunsmith = { card, run, engine: api };
})(typeof window !== 'undefined' ? window : globalThis);
