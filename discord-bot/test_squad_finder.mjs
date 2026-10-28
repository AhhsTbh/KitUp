// Offline test for the /link + /lfg squad finder. Runs the Netlify function against a fake Discord.
//   node discord-bot/test_squad_finder.mjs
import crypto from "node:crypto";
import assert from "node:assert/strict";
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
process.env.DISCORD_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
process.env.DISCORD_TOKEN = "test-token";
process.env.URL = "https://kitup.test";

// ---- mock Discord ----
const G = "G1"; let nid = 1; const nextId = () => String(nid++);
const db = { channels: [{ id: "C-lfg", name: "lfg-dmz", type: 0 }], msgs: {}, roles: [{ id: "R-x", name: "Xbox" }, { id: "R-p", name: "PlayStation" }, { id: "R-c", name: "PC" }], grants: [], calls: 0 };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url); const path = u.pathname.replace("/api/v10", ""); const m = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null; db.calls++;
  const ok = (o, s = 200) => new Response(o === null ? null : JSON.stringify(o), { status: s });
  if (m === "GET" && path === `/guilds/${G}/channels`) return ok(db.channels);
  if (m === "POST" && path === `/guilds/${G}/channels`) { const c = { id: nextId(), type: 0, ...body }; db.channels.push(c); db.msgs[c.id] = []; return ok(c); }
  let r;
  if ((r = path.match(/^\/channels\/(\w+)\/messages$/))) {
    const list = db.msgs[r[1]] ||= [];
    if (m === "GET") { let l = [...list].reverse(); const b = u.searchParams.get("before"); if (b) l = l.filter(x => Number(x.id) < Number(b)); return ok(l.slice(0, Number(u.searchParams.get("limit") || 50))); }
    if (m === "POST") { const msg = { id: nextId(), content: body.content }; list.push(msg); return ok(msg); }
  }
  if ((r = path.match(/^\/channels\/(\w+)\/messages\/(\w+)$/))) {
    const list = db.msgs[r[1]]; const i = list.findIndex(x => x.id === r[2]);
    if (m === "PATCH") { list[i].content = body.content; return ok(list[i]); }
    if (m === "DELETE") { list.splice(i, 1); return ok(null, 204); }
  }
  if (m === "GET" && path === `/guilds/${G}/roles`) return ok(db.roles);
  if ((r = path.match(/^\/guilds\/\w+\/members\/([\w-]+)\/roles\/([\w-]+)$/)) && m === "PUT") { db.grants.push([r[1], r[2]]); return ok(null, 204); }
  return ok({ message: "unmocked " + m + " " + path }, 404);
};

const handler = (await import("../netlify/functions/discord.mjs")).default;
async function send(i) {
  const body = JSON.stringify(i), ts = String(Date.now());
  const sig = crypto.sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  const res = await handler(new Request("https://kitup.test/api/discord", { method: "POST", body, headers: { "x-signature-ed25519": sig, "x-signature-timestamp": ts } }));
  return res.json();
}
const user = (id, perms = "0") => ({ member: { user: { id }, permissions: perms, roles: [] }, guild_id: G });
const cmd = (u, name, options = []) => ({ type: 2, ...user(u), data: { name, options: options.map(([n, v]) => ({ name: n, value: v })) } });
const btn = (u, msg, action, mode = "dmz", slots = 4, perms = "0") => ({ type: 3, ...user(u, perms), message: msg, data: { custom_id: `kitup:lfg:${action}:${mode}:${slots}` } });
const toMsg = r => ({ content: r.data.content, embeds: r.data.embeds });
const squad = r => r.data.embeds[0].fields[0].value;
let n = 0; const t = (name) => console.log(`  ✓ ${name}`, ++n && "");

// 1. LFG before linking is refused
let r = await send(cmd("1001", "lfg", [["mode", "dmz"]]));
assert.match(r.data.content, /Link your Activision ID first/); t("/lfg is refused until the player has linked");
// 2. bad ID is rejected
r = await send(cmd("1001", "link", [["platform", "xbox"], ["activision", "nope"]]));
assert.match(r.data.content, /doesn't look like an Activision ID/); t("a malformed Activision ID is rejected");
// 3. link works, creates the private data channel, gives the role
r = await send(cmd("1001", "link", [["platform", "xbox"], ["activision", "Kyler#1234567"], ["gamertag", "KylerGT"]]));
assert.match(r.data.content, /Linked \*\*Xbox\*\*/); assert.equal(r.data.flags, 64);
const dc = db.channels.find(c => c.name === "kitup-data"); assert.ok(dc); assert.equal(dc.permission_overwrites[0].deny, "1024");
assert.deepEqual(db.grants, [["1001", "R-x"]]); t("/link saves privately (hidden channel), ephemeral reply, Xbox role granted");
// 4. profile lookup
r = await send(cmd("1001", "profile")); assert.match(r.data.content, /Kyler#1234567/); t("/profile shows the linked ID");
// 5. relink edits in place (no duplicate)
await send(cmd("1001", "link", [["platform", "pc"], ["activision", "Kyler#7654321"]]));
assert.equal(db.msgs[dc.id].length, 1); assert.match(db.msgs[dc.id][0].content, /Kyler#7654321/); t("re-linking edits the same record");
// back to xbox for the rest
await send(cmd("1001", "link", [["platform", "xbox"], ["activision", "Kyler#1234567"]]));
// 6. host posts a DMZ squad
r = await send(cmd("1001", "lfg", [["mode", "dmz"], ["note", "Chill infils, mic on"]]));
assert.equal(r.type, 4); assert.match(r.data.embeds[0].title, /DMZ · 1\/4/); assert.equal(r.data.components[0].components.length, 3);
assert.equal(r.data.allowed_mentions.parse.length, 0); t("/lfg posts a squad (1/4) with Join, Leave, Close and no pings");
let msg = toMsg(r);
// 7. PlayStation + PC players join
await send(cmd("1002", "link", [["platform", "ps"], ["activision", "Ghost#1111111"]]));
await send(cmd("1003", "link", [["platform", "pc"], ["activision", "Soap#2222222"]]));
r = await send(btn("1002", msg, "join")); assert.equal(r.type, 7); msg = toMsg(r);
r = await send(btn("1003", msg, "join")); msg = toMsg(r);
assert.match(r.data.embeds[0].title, /3\/4/); assert.match(squad(r), /Xbox/); assert.match(squad(r), /PlayStation/); assert.match(squad(r), /PC/);
assert.match(r.data.embeds[0].description, /Chill infils/); t("Xbox, PlayStation and PC players all join the same squad; note kept");
// 8. duplicate join + unlinked join
r = await send(btn("1002", msg, "join")); assert.match(r.data.content, /already in/); t("joining twice is refused");
r = await send(btn("1009", msg, "join")); assert.match(r.data.content, /Link your Activision ID/); t("an unlinked player can't join");
// 9. fills up and locks the Join button
await send(cmd("1004", "link", [["platform", "xbox"], ["activision", "Price#3333333"]]));
r = await send(btn("1004", msg, "join")); msg = toMsg(r);
assert.match(r.data.embeds[0].title, /4\/4 · ✅ Squad full/); assert.equal(r.data.components[0].components[0].disabled, true); t("full squad shows 4/4 and disables Join");
await send(cmd("1005", "link", [["platform", "ps"], ["activision", "Gaz#4444444"]]));
r = await send(btn("1005", msg, "join")); assert.match(r.data.content, /full/); t("joining a full squad is refused");
// 10. leave: member can, host can't
r = await send(btn("1003", msg, "leave")); msg = toMsg(r); assert.match(r.data.embeds[0].title, /3\/4/); assert.equal(r.data.components[0].components[0].disabled, false); t("a member can leave and Join re-opens");
r = await send(btn("1001", msg, "leave")); assert.match(r.data.content, /Close/); t("the host is told to use Close");
// 11. close: stranger no, host yes, mod yes
r = await send(btn("1005", msg, "close")); assert.match(r.data.content, /Only the person who started/); t("a stranger can't close it");
r = await send(btn("1007", msg, "close", "dmz", 4, String(0x2000))); assert.deepEqual(r.data.components, []); assert.match(r.data.embeds[0].title, /Closed/); t("a mod (Manage Messages) can close it");
r = await send(btn("1001", msg, "close")); assert.match(r.data.embeds[0].title, /🔒 Closed/); assert.deepEqual(r.data.components, []); t("the host closes it and the buttons go away");
// 12. multiplayer defaults to 6, slots override
r = await send(cmd("1001", "lfg", [["mode", "mp"]])); assert.match(r.data.embeds[0].title, /1\/6/);
r = await send(cmd("1001", "lfg", [["mode", "dmz"], ["slots", 2]])); assert.match(r.data.embeds[0].title, /1\/2/); t("Multiplayer defaults to 6 slots; slots override works");
// 13. markdown / mention injection is stripped
r = await send(cmd("1001", "lfg", [["mode", "wz"], ["note", "@everyone <@&123> **hi**"]]));
assert.ok(!/@everyone|<@&/.test(r.data.embeds[0].description)); t("note can't smuggle @everyone or role pings");
// 14. unlink
r = await send(cmd("1001", "unlink")); assert.match(r.data.content, /Unlinked/);
r = await send(cmd("1001", "lfg", [["mode", "dmz"]])); assert.match(r.data.content, /Link your Activision ID first/); t("/unlink deletes the ID");
// 15. no token -> friendly message
delete process.env.DISCORD_TOKEN; r = await send(cmd("1001", "lfg", [["mode", "dmz"]])); assert.match(r.data.content, /isn't switched on/); t("missing bot token gives a clear message");
// 16. existing commands still routed (falls through to data path, mocked data fetch fails gracefully)
process.env.DISCORD_TOKEN = "x"; r = await send(cmd("1001", "meta")); assert.ok(r.data.content || r.data.embeds); t("existing commands still reach their handlers");
console.log(`\nAll ${n} checks passed`);
