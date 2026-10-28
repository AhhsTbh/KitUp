"""Create #📖・server-guide under START HERE and post the Kit Up server guide there.

The guide is six art cards (discord-bot/cards/guide/), each posted by the Kit Up bot
with a short message whose channel names are clickable links. The cover is pinned.
The channel copies START HERE's permissions, so only staff and the bot can post.

Safe to run again: if the guide is already there it is left alone.
Pass --refresh to delete the old guide messages and post the current ones.

Usage (from the repo root, standard library only):
    DISCORD_TOKEN=... DISCORD_GUILD_ID=... python discord-bot/post_guide.py [--refresh]

Or on GitHub: Actions → Discord server guide → Run workflow.
"""

import argparse
import os
import sys
import time

from pin_cards import Discord, PIN_NOTICE

HERE = os.path.dirname(os.path.abspath(__file__))
GUIDE_DIR = os.path.join(HERE, "cards", "guide")
MARK = "kitup-guide-"

CATEGORY = "👋 START HERE"
CHANNEL = "📖・server-guide"
TOPIC = "Everything in KitUp N Lounge in one scroll. Tap a channel name to jump there."
# Order of the channels inside START HERE once the guide exists.
START_ORDER = ["👋・welcome", "📖・server-guide", "📜・house-rules", "🎨・pick-roles"]

# (card image, alt text, message). {name} is replaced with a clickable link to that channel.
SECTIONS = [
    ("guide-1-cover.png", "Server guide: start here, Kit Up feed, ask the bot, squad up, hang out, roles and pings.",
     "# 📖 Server Guide\nEverything in **KitUp N Lounge** in one scroll. Tap any channel name to jump there."),
    ("guide-2-start.png", "Start here: read the rules, pick your roles, link your Activision ID, say what's up.",
     "## 👋 Start here\n"
     "**1.** Read {📜・house-rules}. It's short.\n"
     "**2.** Grab your platform, modes and pings in {🎨・pick-roles}.\n"
     "**3.** Run `/link` to save your platform and Activision ID. It only takes a second.\n"
     "**4.** Say what's up in {🛋️・lounge}, or hop in {🛋️ The Couch}."),
    ("guide-3-feed.png", "Kit Up feed: meta updates, patch notes, news and the store, posted by the app.",
     "## 📡 Kit Up feed\nPosted by the Kit Up app. Read-only, always fresh.\n"
     "{🎯・meta-updates} daily tiers, pick rates and movers\n"
     "{📋・patch-notes} official patch notes with buffs, nerfs and adjusts\n"
     "{📰・news} official MW4 news\n"
     "{🛒・store} today's store\n"
     "Want a ping when something drops? Turn on **📈 Meta Alerts** or **📋 Patch Alerts** in {🎨・pick-roles}."),
    ("guide-4-bot.png", "Ask the bot: /meta /build /gun /range /patch /news /store.",
     "## 🤖 Ask the bot\nType `/` in {🤖・ask-kit-up}.\n"
     "`/meta` live tier list · `/build` meta builds for any gun · `/gun` TTK and handling\n"
     "`/range` best gun at a distance · `/patch` latest patch notes · `/news` latest news · `/store` today's store"),
    ("guide-5-squad.png", "Squad up: link your Activision ID, then post with /lfg multiplayer, /lfg dmz or /lfg warzone.",
     "## 🎮 Squad up\nXbox, PlayStation and PC all play together.\n"
     "**1.** `/link` once with your platform and Activision ID.\n"
     "**2.** Post with `/lfg multiplayer`, `/lfg dmz` or `/lfg warzone` in {🎮・lfg-multiplayer} or {☢️・lfg-dmz}.\n"
     "**3.** Tap **Join** on any post, then hop in {🎮 Squad 1}, {🎮 Squad 2} or {☢️ DMZ Infil}."),
    ("guide-6-hang.png", "Hang out: lounge, clips, memes, now playing, build share and meta talk.",
     "## 🛋️ Hang out\n"
     "{🛋️・lounge} talk about anything · {🎬・clips} best and worst plays · {😂・memes} keep it SFW\n"
     "{🎧・now-playing} what's in your headset · {🔧・build-share} share Kit Up loadout links · {🧠・meta-talk} argue the meta\n\n"
     "Questions? Ask anyone with the **HQ** or **Overwatch** role."),
]


def link(text, ids):
    for name, cid in ids.items():
        text = text.replace("{" + name + "}", f"<#{cid}>")
    return text


def is_guide(msg, me):
    return msg.get("author", {}).get("id") == me and any(
        a.get("filename", "").startswith(MARK) for a in msg.get("attachments", []))


def run(token, guild_id, refresh=False):
    d = Discord(token)
    me = d.call("GET", "/users/@me")["id"]
    all_ch = d.call("GET", f"/guilds/{guild_id}/channels")
    by_name = {c["name"]: c for c in all_ch}
    cat = next((c for c in all_ch if c.get("type") == 4 and c["name"] == CATEGORY), None)
    if not cat:
        sys.exit(f"Category '{CATEGORY}' not found. Run setup_server.py first.")

    ch = by_name.get(CHANNEL)
    if not ch:
        ch = d.call("POST", f"/guilds/{guild_id}/channels", body={
            "name": CHANNEL, "type": 0, "parent_id": cat["id"], "topic": TOPIC,
            "permission_overwrites": cat.get("permission_overwrites", [])})
        print(f"  + created #{CHANNEL}")
        all_ch.append(ch)
        by_name[CHANNEL] = ch
    # Put the guide right under #welcome.
    inside = sorted((c for c in all_ch if c.get("parent_id") == cat["id"] and c.get("type") == 0),
                    key=lambda c: c.get("position", 0))
    order = [by_name[n] for n in START_ORDER if n in by_name] + [c for c in inside if c["name"] not in START_ORDER]
    base = min(c.get("position", 0) for c in inside) if inside else 0
    d.call("PATCH", f"/guilds/{guild_id}/channels",
           body=[{"id": c["id"], "position": base + i} for i, c in enumerate(order)])

    cid = ch["id"]
    old = [m for m in (d.call("GET", f"/channels/{cid}/messages?limit=50") or []) if is_guide(m, me)]
    if old and not refresh:
        print(f"  · #{CHANNEL} already has the guide ({len(old)} messages). Use --refresh to repost.")
        return 0
    for m in old:
        d.call("DELETE", f"/channels/{cid}/messages/{m['id']}")
        time.sleep(0.3)

    ids = {c["name"]: c["id"] for c in all_ch}
    missing = sorted({part.split("}")[0] for _, _, t in SECTIONS for part in t.split("{")[1:]} - set(ids))
    if missing:
        print("  ! these channels weren't found, so they show as plain text: " + ", ".join(missing))
    first = None
    for fname, alt, text in SECTIONS:
        with open(os.path.join(GUIDE_DIR, fname), "rb") as f:
            blob = f.read()
        upload = MARK + fname
        body = link(text, ids)
        for name in missing:
            body = body.replace("{" + name + "}", "#" + name)
        msg = d.call("POST", f"/channels/{cid}/messages",
                     body={"content": body, "allowed_mentions": {"parse": []},
                           "attachments": [{"id": 0, "filename": upload, "description": alt[:1024]}]},
                     files=[(upload, blob)])
        first = first or msg
        print(f"  + posted {fname}")
        time.sleep(0.6)

    d.pin(cid, first["id"])
    time.sleep(0.6)
    for m in d.call("GET", f"/channels/{cid}/messages?limit=10") or []:
        if m.get("type") == PIN_NOTICE:
            d.call("DELETE", f"/channels/{cid}/messages/{m['id']}")
    print(f"  📌 pinned the cover in #{CHANNEL}")
    return len(SECTIONS)


def main():
    ap = argparse.ArgumentParser(description="Create #server-guide and post the Kit Up server guide.")
    ap.add_argument("--refresh", action="store_true", help="delete the old guide and post the current one")
    a = ap.parse_args()
    token, guild = os.environ.get("DISCORD_TOKEN"), os.environ.get("DISCORD_GUILD_ID")
    if not token or not guild:
        sys.exit("Set DISCORD_TOKEN and DISCORD_GUILD_ID. On GitHub: Settings → Secrets and variables → Actions.")
    print("Posting the Kit Up server guide…")
    n = run(token, guild, refresh=a.refresh)
    print(f"Done. {n} guide card(s) posted.")


if __name__ == "__main__":
    main()
