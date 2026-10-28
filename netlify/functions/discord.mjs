// Kit Up Discord slash commands, served by Netlify (no always-on bot needed).
// Discord sends each /command or button press here; we read the app's own
// data/ files and answer with Kit Up-styled embeds.
//
// Netlify environment variables (Site configuration → Environment variables):
//   DISCORD_PUBLIC_KEY  optional, defaults to the Kit Up app's public key below
//   DISCORD_TOKEN       the bot token; only needed for the #pick-roles buttons
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
    components: linkRow(["Open the meta in Kit Up", `${site}/#meta`, "🎯"]),
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
    components: linkRow(["Open in Kit Up", `${site}/#g-${id}`]),
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
  const btns = builds.filter(b => b.code && `${site}/#${b.code}`.length <= 512).map(b => [`Load ${b.name}`, `${site}/#${b.code}`]);
  return reply({ embeds, components: linkRow(...(btns.length ? btns : [["Loadout maker", `${site}/#build`]])) });
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
  const name = ROLES[i.data.custom_id.split(":")[2]];
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
  return say(has ? `Dropped **${name}**.` : `Added **${name}**.`);
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
