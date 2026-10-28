// Kit Up Discord slash commands, served by Netlify (no always-on bot needed).
// Discord sends each /command or button press here; we read the app's own
// data/ files and answer with Kit Up-styled embeds.
//
// Netlify environment variables (Site configuration → Environment variables):
//   DISCORD_PUBLIC_KEY  optional, defaults to the Kit Up app's public key below
//   DISCORD_TOKEN       the bot token; needed for the #pick-roles buttons and the /link + /lfg squad finder
import crypto from "node:crypto";

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ||
  "0a03b171d3a1c70b3ba2348dbe506c32857be8ada2b6ed5e2aa9573599a230f7";

const C = { accent: 0x9b7bff, accentText: 0xb49dff, gold: 0xf2b726, buff: 0x62be7c, nerf: 0xe8645a, adjust: 0x7aa9d6 };
const TIER_COLOR = { S: C.gold, A: C.accent, B: C.adjust };
const TIER_DOT = { S: "🟨", A: "🟪", B: "🟦" };
const TYPE_ICON = { buff: "🟢", nerf: "🔴", adjust: "🔵" };
const ROLES = {
  pc: "PC", ps: "PlayStation", xbox: "Xbox", mp: "Multiplayer", dmz: "DMZ",
  wz: "Warzone", patch: "Patch Alerts", meta: "Meta Alerts",
};
const ROLE_EMOJI = {
  pc: "🖥️", ps: "🎮", xbox: "🟩", mp: "🎯", dmz: "☢️", wz: "🪂", patch: "📋", meta: "📈",
};
const EPHEMERAL = 64;

// ---------- helpers ----------

function verify(body, sig, ts) {
  if (!sig || !ts) return false;
  try {
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(PUBLIC_KEY, "hex")]);
    const key = crypto.createPublicKey({ key: der, format: "der", type: "spki" });
    return crypto.verify(null, Buffer.from(ts + body), key, Buffer.from(sig, "hex"));
  } catch { return false; }
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
const reply = (data) => json({ type: 4, data });
const say = (content) => reply({ content, flags: EPHEMERAL });

async function loadData(site) {
  const names = ["game", "tiers", "meta", "patches", "news", "shop", "history"];
  const files = await Promise.all(names.map(n =>
    fetch(`${site}/data/${n}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)));
  const d = Object.fromEntries(names.map((n, i) => [n, files[i]]));
  d.W = Object.fromEntries((d.game?.weapons || []).map(w => [w.id, w]));
  d.cats = Object.fromEntries((d.game?.categories || []).map(c => [c.id, c]));
  d.tierOf = {};
  for (const t of d.tiers?.tiers || []) for (const id of t.ids || []) d.tierOf[id] = t.t;
  d.name = id => d.W[id]?.name || id;
  d.pick = id => d.tiers?.picks?.[id] ?? d.W[id]?.pick;
  return d;
}

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function findGun(d, text) {
  if (!text) return null;
  if (d.W[text]) return text;
  const t = norm(text);
  const ids = Object.keys(d.W);
  return ids.find(id => norm(d.W[id].name) === t || norm(id) === t) ||
    ids.find(id => t && (norm(d.W[id].name).includes(t) || norm(id).includes(t))) || null;
}

const pct = p => (p == null ? "—" : `${Number(p).toFixed(1)}%`);
const footer = (site, text = "Kit Up · MW4 companion") => ({ text, icon_url: `${site}/icons/logo-192.png` });
const linkRow = (...btns) => [{ type: 1, components: btns.filter(Boolean).slice(0, 5).map(([label, url, emoji]) =>
  ({ type: 2, style: 5, label: label.slice(0, 80), url, ...(emoji ? { emoji: { name: emoji } } : {}) })) }];

// ---------- commands ----------

function movers(d, limit = 5) {
  const days = d.history?.days || [];
  if (days.length < 2) return null;
  const rows = [];
  for (const [id, s] of Object.entries(d.history.picks || {})) {
    const a = s[s.length - 2], b = s[s.length - 1];
    if (a != null && b != null && Math.abs(b - a) >= 0.3) rows.push([b - a, id, b]);
  }
  if (!rows.length) return null;
  rows.sort((x, y) => Math.abs(y[0]) - Math.abs(x[0]));
  return rows.slice(0, limit).map(([dl, id, now]) =>
    `${dl > 0 ? "▲" : "▼"} **${d.name(id)}** ${dl > 0 ? "+" : ""}${dl.toFixed(1)} pts → ${now.toFixed(1)}%`).join("\n");
}

function cmdMeta(d, site) {
  const fields = (d.tiers?.tiers || []).filter(t => t.ids?.length).map(t => ({
    name: `${TIER_DOT[t.t] || "⬜"} ${t.t} tier · ${t.label || ""}`,
    value: t.ids.slice(0, 12).map(id => `**${d.name(id)}** · ${pct(d.pick(id))}`).join("\n").slice(0, 1024),
    inline: true,
  }));
  const m = movers(d);
  if (m) fields.push({ name: "📈 Movers since last update", value: m, inline: false });
  return reply({
    embeds: [{ title: "🎯 Live meta", url: `${site}/#meta`, color: C.accent,
      description: "Pick rate = how often players run it, not raw power.",
      fields, footer: footer(site, `Kit Up · updated ${d.tiers?.updated || "?"}`) }],
  });
}

function cmdGun(d, site, id) {
  const w = d.W[id], L = w.live || {}, tier = d.tierOf[id];
  const ms = k => (L[k] != null ? `${L[k]} ms` : "—");
  const fields = [
    { name: "Meta", value: `${TIER_DOT[tier] || "⬜"} ${tier ? tier + " tier" : "Unranked"}\nPicked ${pct(d.pick(id))}`, inline: true },
    { name: "TTK", value: `15 m · ${ms("ttk15")}\n40 m · ${ms("ttk40")}\n80 m · ${ms("ttk80")}`, inline: true },
    { name: "Handling", value: `ADS · ${ms("ads")}\nSprint-to-fire · ${ms("stf")}\nReload · ${ms("reload")}`, inline: true },
    { name: "Gun", value: `${L.rpm ?? w.rpm ?? "—"} RPM · ${L.mag ?? w.mag ?? "—"} rounds\nUnlocks at level ${w.unlock ?? "—"}`, inline: true },
  ];
  if (w.apex) fields.push({ name: `Apex · ${w.apex.name}`, value: (w.apex.about || "—").slice(0, 1024), inline: false });
  return reply({
    embeds: [{ title: w.name, url: `${site}/#g-${id}`, color: TIER_COLOR[tier] || C.accent,
      description: `*${d.cats[w.cat]?.one || ""}* — ${w.about || ""}`, fields,
      ...(w.photo ? { image: { url: `${site}/${w.photo}` } } : {}), footer: footer(site) }],
  });
}

function cmdBuild(d, site, id) {
  const builds = (d.meta || []).filter(b => b.w === id).slice(0, 3);
  if (!builds.length) return reply({
    content: `No meta builds for the **${d.name(id)}** right now. Make your own in the loadout maker.`,
    components: linkRow(["Loadout maker", `${site}/#build`]),
  });
  const embeds = builds.map(b => ({
    title: b.name, color: TIER_COLOR[b.tier] || C.accent,
    ...(b.code ? { url: `${site}/#${b.code}` } : {}),
    description: `${b.role || ""}\n${b.note || ""}`,
    fields: [{ name: "Attachments", value: ((b.att || []).map(a => `\`${a.s}\` ${a.n}`).join("\n") || "Iron sights, no attachments.").slice(0, 1024) }],
    footer: footer(site, "Tap the title to load this build in Kit Up"),
  }));
  // The embed title is the link that loads each build in Kit Up.
  return reply({ embeds });
}

function cmdRange(d, site, meters) {
  const buckets = [[15, "ttk15"], [40, "ttk40"], [80, "ttk80"], [100, "ttk100"]];
  const [m, key] = buckets.reduce((a, b) => (Math.abs(b[0] - meters) < Math.abs(a[0] - meters) ? b : a));
  const rows = Object.entries(d.W).filter(([, w]) => w.live?.[key]).map(([id, w]) => [w.live[key], id]).sort((a, b) => a[0] - b[0]);
  return reply({
    embeds: [{ title: `📏 Best TTK around ${m} m`, color: C.accent, footer: footer(site, "Kit Up · range finder"),
      description: rows.slice(0, 5).map(([t, id], i) => `\`${i + 1}.\` **${d.name(id)}** · ${t} ms`).join("\n") || "No data yet." }],
    components: linkRow(["Range finder", `${site}/#range`, "📏"]),
  });
}

function cmdPatch(d, site) {
  const p = d.patches?.[0];
  if (!p) return say("No patch notes yet.");
  const lines = (p.changes || []).slice(0, 20).map(c =>
    `${TYPE_ICON[c.type] || "⚪"} **${c.item || d.name(c.weapon) || ""}** — ${c.text || ""}`);
  const fields = [];
  let chunk = [];
  for (const ln of lines) {
    if ((chunk.join("\n") + ln).length > 1000) { fields.push({ name: fields.length ? "​" : "Changes", value: chunk.join("\n") }); chunk = []; }
    chunk.push(ln);
  }
  if (chunk.length) fields.push({ name: fields.length ? "​" : "Changes", value: chunk.join("\n") });
  if (p.modes?.length) fields.push({ name: "Modes", value: p.modes.slice(0, 8).map(x => "• " + x).join("\n").slice(0, 1024) });
  return reply({
    embeds: [{ title: `📋 ${p.title || "Patch notes"}`, ...(p.url ? { url: p.url } : {}), color: C.accent,
      description: `**${p.season || ""}** · ${p.date || ""}\n${p.summary || ""}`, fields,
      footer: footer(site, "🟢 buff · 🔴 nerf · 🔵 adjust") }],
    components: linkRow(["All patch notes", `${site}/#patches`, "📋"]),
  });
}

function cmdNews(d, site) {
  const items = [...(d.news || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 3);
  if (!items.length) return say("No news yet.");
  return reply({ embeds: items.map(n => ({ title: `📰 ${n.title || ""}`, ...(n.url ? { url: n.url } : {}),
    description: n.body || "", color: C.accentText, footer: footer(site, `${n.tag || "News"} · ${n.date || "Kit Up"}`) })) });
}

function cmdStore(d, site) {
  const s = d.shop || {}, items = s.items || [];
  const embed = !items.length
    ? { title: "🛒 Store", description: "Today's store isn't confirmed yet.", color: C.accent, footer: footer(site) }
    : { title: `🛒 Store · ${s.date}`, url: `${site}/#shop`, color: C.gold, footer: footer(site),
        fields: items.slice(0, 10).map(it => ({ name: it.name || "Item",
          value: ([it.type, typeof it.price === "number" ? `${it.price.toLocaleString("en-US")} ${it.currency || "CP"}` : ""].filter(Boolean).join(" · ") +
            (it.items?.length ? `\n${it.items.join(", ")}` : "") + (it.note ? `\n*${it.note}*` : "")).slice(0, 1024) || "​" })) };
  return reply({ embeds: [embed], components: linkRow(["Store in Kit Up", `${site}/#shop`, "🛒"]) });
}

// ---------- role buttons ----------

async function toggleRole(i) {
  const key = i.data.custom_id.split(":")[2];
  const name = ROLES[key];
  const token = process.env.DISCORD_TOKEN;
  if (!name || !token) return say("Role buttons aren't switched on yet. HQ needs to add the bot token on Netlify.");
  const api = (path, method = "GET") => fetch(`https://discord.com/api/v10${path}`,
    { method, headers: { Authorization: `Bot ${token}`, "X-Audit-Log-Reason": "Kit Up role picker" } });
  const roles = await (await api(`/guilds/${i.guild_id}/roles`)).json();
  const role = Array.isArray(roles) && roles.find(r => r.name === name);
  if (!role) return say(`The **${name}** role is missing. Ask HQ to rerun the setup.`);
  const has = (i.member?.roles || []).includes(role.id);
  const r = await api(`/guilds/${i.guild_id}/members/${i.member.user.id}/roles/${role.id}`, has ? "DELETE" : "PUT");
  if (!r.ok) return say("I can't hand out that role. HQ needs to move my role above it.");
  return say(has ? `Dropped **${name}**.` : `Added **${name}**. ${ROLE_EMOJI[key]}`);
}

// ---------- Activision link + squad finder ----------

const PLATFORMS = {
  xbox: { name: "Xbox", emoji: "🟩", role: "Xbox" },
  ps: { name: "PlayStation", emoji: "🟦", role: "PlayStation" },
  pc: { name: "PC", emoji: "🖥️", role: "PC" },
};
// "kind" decides the emoji, default squad size and which voice channel to suggest.
// The specific game mode (Hardpoint, Gunfight, ...) is read live from the app's data/maps.json.
const MODES = {
  dmz: { label: "DMZ", emoji: "☢️", slots: 3, voice: "DMZ Infil" },
  mp: { label: "Multiplayer", emoji: "🎯", slots: 6, voice: "Squad 1 or Squad 2" },
  wz: { label: "Warzone", emoji: "🪂", slots: 4, voice: "Squad 1 or Squad 2" },
};
const MODE_SLOTS = { gunfight: 2 }; // Gunfight is 2v2
const slug = s => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Modes are fixed dropdown choices registered with the /lfg subcommands (see register_commands.py),
// so picking a mode never calls this function. Only the final post does.
const SUB_GAME = { dmz: "dmz", multiplayer: "mp", warzone: "wz" };
function resolveMode(game, value) {
  const M = MODES[game];
  if (!M) return null;
  const mode = clean(value).slice(0, 40);
  if (!mode) return { kind: game, label: M.label, slots: M.slots };
  const label = game === "mp" ? mode : `${M.label}: ${mode}`;
  return { kind: game, label, slots: MODE_SLOTS[slug(mode)] || M.slots };
}
const DATA_CHANNEL = "kitup-data";
const MANAGE_MESSAGES = 0x2000n;
let dataChannelId = null; // cached per warm function instance

const dapi = async (path, method = "GET", body) => {
  const r = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, "Content-Type": "application/json", "User-Agent": "KitUpBot (https://kitup.gg, 1.0)" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return r.status === 204 ? null : r.json();
};

// Profiles live as one message each in a private #kitup-data channel (only HQ can see it):
//   profile <userId> {"p":"xbox","a":"Name#1234567","g":"gamertag"}
async function dataChannel(guildId) {
  if (dataChannelId) return dataChannelId;
  const chans = await dapi(`/guilds/${guildId}/channels`);
  let ch = chans.find(c => c.name === DATA_CHANNEL && c.type === 0);
  if (!ch) ch = await dapi(`/guilds/${guildId}/channels`, "POST", {
    name: DATA_CHANNEL, type: 0, topic: "Kit Up bot storage for linked Activision IDs. Please don't edit.",
    permission_overwrites: [{ id: guildId, type: 0, deny: "1024" }], // @everyone can't view
  });
  return (dataChannelId = ch.id);
}

async function findProfile(guildId, userId) {
  const cid = await dataChannel(guildId);
  let before = "";
  for (let page = 0; page < 3; page++) {
    const msgs = await dapi(`/channels/${cid}/messages?limit=100${before}`);
    for (const m of msgs) {
      if (m.content.startsWith(`profile ${userId} `)) {
        try { return { ...JSON.parse(m.content.slice(`profile ${userId} `.length)), mid: m.id, cid }; } catch { /* skip */ }
      }
    }
    if (msgs.length < 100) break;
    before = `&before=${msgs[msgs.length - 1].id}`;
  }
  return { cid };
}

const getProfile = async (guildId, userId) => { const p = await findProfile(guildId, userId); return p.a ? p : null; };

async function saveProfile(guildId, userId, data) {
  const existing = await findProfile(guildId, userId);
  const content = `profile ${userId} ${JSON.stringify(data)}`;
  if (existing.mid) await dapi(`/channels/${existing.cid}/messages/${existing.mid}`, "PATCH", { content });
  else await dapi(`/channels/${existing.cid}/messages`, "POST", { content, allowed_mentions: { parse: [] } });
}

async function deleteProfile(guildId, userId) {
  const existing = await findProfile(guildId, userId);
  if (!existing.mid) return false;
  await dapi(`/channels/${existing.cid}/messages/${existing.mid}`, "DELETE");
  return true;
}

async function giveRole(guildId, userId, roleName) {
  try {
    const roles = await dapi(`/guilds/${guildId}/roles`);
    const role = roles.find(r => r.name === roleName);
    if (!role) return false;
    await dapi(`/guilds/${guildId}/members/${userId}/roles/${role.id}`, "PUT");
    return true;
  } catch { return false; }
}

const tokenMissing = () => say("Squad finder isn't switched on yet. HQ needs to add the bot token on Netlify (DISCORD_TOKEN).");
const clean = s => String(s || "").replace(/[`*_~|<>@\\\r\n]/g, "").trim();
const ID_RE = /^.{2,30}#\d{4,8}$/;
const needLink = () => say("Link your Activision ID first with `/link`, then try again. It takes 10 seconds.");
const userOf = i => i.member?.user || i.user;

async function cmdLink(i, opts) {
  if (!process.env.DISCORD_TOKEN) return tokenMissing();
  const p = PLATFORMS[opts.platform?.value];
  const a = clean(opts.activision?.value);
  const g = clean(opts.gamertag?.value).slice(0, 30);
  if (!p) return say("Pick Xbox, PlayStation or PC.");
  if (!ID_RE.test(a)) return say("That doesn't look like an Activision ID. It looks like `Name#1234567`.");
  const u = userOf(i);
  const key = opts.platform.value;
  const [, gotRole] = await Promise.all([
    saveProfile(i.guild_id, u.id, { p: key, a, ...(g ? { g } : {}) }),
    giveRole(i.guild_id, u.id, p.role),
  ]);
  return say(`${p.emoji} Linked **${p.name}** · \`${a}\`${g ? ` · ${g}` : ""}\n` +
    `${gotRole ? `You've got the **${p.role}** role. ` : ""}Use \`/lfg\` to post a squad request, or tap **Join** on someone else's. ` +
    `Everyone can see your Activision ID once you join or post. Run \`/unlink\` any time to remove it.`);
}

async function cmdUnlink(i) {
  if (!process.env.DISCORD_TOKEN) return tokenMissing();
  const gone = await deleteProfile(i.guild_id, userOf(i).id);
  return say(gone ? "Unlinked. Your Activision ID is deleted from Kit Up." : "You didn't have an Activision ID linked.");
}

async function cmdProfile(i, opts) {
  if (!process.env.DISCORD_TOKEN) return tokenMissing();
  const id = opts.user?.value || userOf(i).id;
  const p = await getProfile(i.guild_id, id);
  if (!p) return say(id === userOf(i).id ? "You haven't linked an Activision ID yet. Use `/link`." : "They haven't linked an Activision ID.");
  const pl = PLATFORMS[p.p] || { name: p.p, emoji: "🎮" };
  return say(`${pl.emoji} <@${id}> · **${pl.name}** · \`${p.a}\`${p.g ? ` · ${p.g}` : ""}`);
}

// An LFG post keeps its own state: the squad lines in the embed and the mode + slots in the button ids.
const memberLine = m => `${m.emoji} **${m.platform}** · \`${m.a}\`${m.g ? ` · ${m.g}` : ""} · <@${m.id}>`;
const LINE_RE = /^(.+?) \*\*(.+?)\*\* · `([^`]+)`(?: · (.+?))? · <@(\d+)>$/;
const parseMembers = embed => ((embed?.fields || []).find(f => f.name === "Squad")?.value || "").split("\n")
  .map(l => LINE_RE.exec(l)).filter(Boolean).map(m => ({ emoji: m[1], platform: m[2], a: m[3], g: m[4], id: m[5] }));

function renderLfg({ kind, label, slots, members, note, closed = false, site }) {
  const M = MODES[kind], n = members.length, full = n >= slots;
  const state = closed ? "🔒 Closed" : full ? "✅ Squad full" : "🔎 Looking for a squad";
  const embed = {
    title: `${M.emoji} ${label || M.label} · ${n}/${slots} · ${state}`,
    color: closed ? 0x6b6b80 : full ? C.buff : C.accent,
    description: note || "Add each other with your Activision IDs and party up. All platforms welcome.",
    fields: [
      { name: "Squad", value: members.map(memberLine).join("\n").slice(0, 1024) || "—" },
      { name: "Voice", value: `🔊 Hop in **${M.voice}** once you're in.`, inline: true },
    ],
    footer: { text: "Kit Up · squad finder", ...(site ? { icon_url: `${site}/icons/logo-192.png` } : {}) },
  };
  const id = a => `kitup:lfg:${a}:${kind}:${slots}`;
  const components = closed ? [] : [{ type: 1, components: [
    { type: 2, style: 3, label: "Join", emoji: { name: "➕" }, custom_id: id("join"), disabled: full },
    { type: 2, style: 2, label: "Leave", custom_id: id("leave") },
    { type: 2, style: 4, label: "Close", custom_id: id("close") },
  ] }];
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}

const memberOf = (u, p) => ({ id: u.id, emoji: (PLATFORMS[p.p] || {}).emoji || "🎮", platform: (PLATFORMS[p.p] || { name: p.p }).name, a: p.a, g: p.g });

async function cmdLfg(i, opts, site) {
  if (!process.env.DISCORD_TOKEN) return tokenMissing();
  const u = userOf(i);
  const sub = i.data?.options?.[0] || {};
  const so = Object.fromEntries((sub.options || []).map(o => [o.name, o]));
  const mode = resolveMode(SUB_GAME[sub.name], so.mode?.value);
  if (!mode) return say("Use `/lfg dmz`, `/lfg multiplayer` or `/lfg warzone`.");
  const p = await getProfile(i.guild_id, u.id);
  if (!p) return needLink();
  const slots = Math.min(6, Math.max(2, Number(so.slots?.value || mode.slots)));
  const note = clean(so.note?.value).slice(0, 100);
  return reply({
    content: `<@${u.id}> is looking for a ${mode.label} squad`,
    ...renderLfg({ kind: mode.kind, label: mode.label, slots, members: [memberOf(u, p)], note, site }),
  });
}

async function lfgButton(i, site) {
  const [, , action, kind, slotsRaw] = i.data.custom_id.split(":");
  const slots = Number(slotsRaw);
  if (!MODES[kind] || !slots) return say("This squad post is out of date. Start a new one with `/lfg`.");
  const embed = i.message?.embeds?.[0];
  const label = /^\S+ (.+?) · \d+\/\d+ ·/.exec(embed?.title || "")?.[1] || MODES[kind].label;
  const members = parseMembers(embed);
  const note = embed?.description && !embed.description.startsWith("Add each other") ? embed.description : "";
  const u = userOf(i), idx = members.findIndex(m => m.id === u.id);
  const update = data => json({ type: 7, data: { content: i.message?.content, ...data } });
  const view = (ms, closed = false) => renderLfg({ kind, label, slots, members: ms, note, closed, site });

  if (action === "join") {
    if (!process.env.DISCORD_TOKEN) return tokenMissing();
    if (idx >= 0) return say("You're already in this squad.");
    if (members.length >= slots) return say("This squad is full.");
    const p = await getProfile(i.guild_id, u.id);
    if (!p) return needLink();
    return update(view([...members, memberOf(u, p)]));
  }
  if (action === "leave") {
    if (idx < 0) return say("You're not in this squad.");
    if (idx === 0) return say("You started this squad, so use **Close** to end it.");
    return update(view(members.filter((_, k) => k !== idx)));
  }
  if (action === "close") {
    const isHost = members[0]?.id === u.id;
    const canManage = (() => { try { return (BigInt(i.member?.permissions || 0) & MANAGE_MESSAGES) !== 0n; } catch { return false; } })();
    if (!isHost && !canManage) return say("Only the person who started this squad can close it.");
    return update(view(members, true));
  }
  return say("Unknown button.");
}

// ---------- entry ----------

export default async (req) => {
  if (req.method !== "POST") return new Response("Kit Up Discord endpoint", { status: 200 });
  const body = await req.text();
  if (!verify(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp")))
    return new Response("bad signature", { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 }); // PING

  if (i.type === 3 && String(i.data?.custom_id || "").startsWith("kitup:role:")) return toggleRole(i);

  const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  const opts = Object.fromEntries((i.data?.options || []).map(o => [o.name, o]));

  // Activision link + squad finder. These don't need the app's data files, so answer before loading them.
  try {
    if (i.type === 3 && String(i.data?.custom_id || "").startsWith("kitup:lfg:")) return await lfgButton(i, site);
    if (i.type === 2 && i.data.name === "link") return await cmdLink(i, opts);
    if (i.type === 2 && i.data.name === "unlink") return await cmdUnlink(i);
    if (i.type === 2 && i.data.name === "profile") return await cmdProfile(i, opts);
    if (i.type === 2 && i.data.name === "lfg") return await cmdLfg(i, opts, site);
  } catch {
    return say("Something went wrong talking to Discord. Try again in a moment.");
  }
  let d;
  try { d = await loadData(site); } catch { return say("Kit Up couldn't reach its data just now. Try again in a minute."); }

  if (i.type === 4) { // autocomplete for gun names
    const cur = String(opts.gun?.value || "").toLowerCase();
    const choices = Object.entries(d.W).filter(([id, w]) => w.name.toLowerCase().includes(cur) || id.includes(cur))
      .sort((a, b) => (d.tierOf[a[0]] || "Z").localeCompare(d.tierOf[b[0]] || "Z") || a[1].name.localeCompare(b[1].name))
      .slice(0, 25).map(([id, w]) => ({ name: w.name, value: id }));
    return json({ type: 8, data: { choices } });
  }

  if (i.type === 2) {
    const name = i.data.name;
    if (name === "meta") return cmdMeta(d, site);
    if (name === "patch") return cmdPatch(d, site);
    if (name === "news") return cmdNews(d, site);
    if (name === "store") return cmdStore(d, site);
    if (name === "range") return cmdRange(d, site, Number(opts.meters?.value || 30));
    if (name === "gun" || name === "build") {
      const id = findGun(d, opts.gun?.value);
      if (!id) return say(`Couldn't find a gun called **${opts.gun?.value}**.`);
      return name === "gun" ? cmdGun(d, site, id) : cmdBuild(d, site, id);
    }
  }
  return say("Unknown command.");
};

export const config = { path: "/api/discord" };
