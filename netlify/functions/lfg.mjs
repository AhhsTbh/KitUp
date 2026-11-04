// Read-only feed of open Kit Up squad posts for the app's Squad Finder screen.
// Reads the bot's /lfg posts from Discord with the existing bot token. Needs env: DISCORD_TOKEN, DISCORD_GUILD_ID.
// Privacy: Activision IDs and member names are never returned, only platform icons, counts and the post note.
const API = "https://discord.com/api/v10";
const EXPIRE_MS = 60 * 60 * 1000; // matches the bot's expiry job

export function parsePosts(messages, guildId, channelId, now = Date.now()) {
  const out = [];
  for (const m of messages || []) {
    const e = m.embeds?.[0];
    const btn = (m.components || []).flatMap(r => r.components || []).find(c => String(c.custom_id || "").startsWith("kitup:lfg:"));
    if (!e || !btn) continue; // not an open squad post (closed and expired posts have no buttons)
    const t = /^\S+ (.+?) · (\d+)\/(\d+) · (.+)$/.exec(e.title || "");
    if (!t || !/Looking/.test(t[4])) continue; // only squads that still need players
    const squad = (e.fields || []).find(f => f.name === "Squad")?.value || "";
    const platforms = [...new Set(squad.split("\n").map(l => l.trim().split(" ")[0]).filter(x => x && x !== "—"))];
    const last = Date.parse(m.edited_timestamp || m.timestamp);
    if (now - last > EXPIRE_MS) continue;
    const note = e.description && !e.description.startsWith("Add each other") ? e.description.slice(0, 100) : "";
    out.push({ id: m.id, mode: t[1], n: +t[2], slots: +t[3], platforms, note, minutesAgo: Math.max(0, Math.round((now - last) / 60000)),
      url: `https://discord.com/channels/${guildId}/${channelId}/${m.id}` });
  }
  return out;
}

const INVITE = "https://discord.gg/2qPdNCwaHn";
export default async (req) => {
  const token = process.env.DISCORD_TOKEN, guild = process.env.DISCORD_GUILD_ID;
  const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=30", "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
  const go = req && new URL(req.url).searchParams.get("go"); // /api/lfg?go=dmz opens that LFG channel in Discord
  if (go && !/^(multiplayer|dmz|warzone)$/.test(go)) return new Response("bad request", { status: 400 });
  if (!token || !guild) return go ? Response.redirect(INVITE, 302) : j({ error: "not_configured" }, 503);
  const call = async p => { const r = await fetch(API + p, { headers: { authorization: `Bot ${token}` } }); if (!r.ok) throw new Error(r.status); return r.json(); };
  if (go) {
    try {
      const all = await (await fetch(`${API}/guilds/${guild}/channels`, { headers: { authorization: `Bot ${token}` } })).json();
      const c = all.find(x => x.type === 0 && x.name.includes("lfg-" + go));
      if (c) return Response.redirect(`https://discord.com/channels/${guild}/${c.id}`, 302);
    } catch {}
    return Response.redirect(INVITE, 302);
  }
  try {
    const chans = (await call(`/guilds/${guild}/channels`)).filter(c => c.type === 0 && /lfg-/.test(c.name));
    const posts = (await Promise.all(chans.map(async c => parsePosts(await call(`/channels/${c.id}/messages?limit=50`), guild, c.id)))).flat();
    posts.sort((a, b) => a.minutesAgo - b.minutesAgo);
    return j({ posts, updated: new Date().toISOString() });
  } catch { return j({ error: "discord_unreachable" }, 502); }
};
export const config = { path: "/api/lfg" };
