"""Close Kit Up squad posts nobody has touched for a while, so LFG never looks stale.

Finds the bot's /lfg posts (they have kitup:lfg: buttons), and any whose last activity
(post or last Join/Leave) is older than --minutes gets its buttons removed and its title
marked "⌛ Expired". Runs every 15 minutes from .github/workflows/discord-lfg-expire.yml.

Usage (from discord-bot/, standard library only):
    DISCORD_TOKEN=... DISCORD_GUILD_ID=... python expire_lfg.py [--minutes 60]
"""

import argparse
import datetime as dt
import os
import sys
import time

from pin_cards import Discord

SKIP = {"kitup-data"}
GREY = 0x4A4458


def lfg_buttons(msg):
    return any(c.get("custom_id", "").startswith("kitup:lfg:")
               for row in msg.get("components", []) for c in row.get("components", []))


def last_activity(msg):
    t = msg.get("edited_timestamp") or msg["timestamp"]
    return dt.datetime.fromisoformat(t.replace("Z", "+00:00"))


def expired_embed(e):
    e = {k: v for k, v in e.items() if k not in ("type", "video", "provider")}
    title = e.get("title", "")
    head = title.rsplit(" · ", 1)[0] if " · " in title else title
    e["title"] = f"{head} · ⌛ Expired"
    e["color"] = GREY
    return e


def run(token, gid, minutes=60, dry=False):
    d = Discord(token)
    me = d.call("GET", "/users/@me")["id"]
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes)
    closed = 0
    for ch in d.call("GET", f"/guilds/{gid}/channels"):
        if ch.get("type") not in (0, 5) or any(s in ch["name"] for s in SKIP):
            continue
        try:
            msgs = d.call("GET", f"/channels/{ch['id']}/messages?limit=50") or []
        except RuntimeError:
            continue  # no access to this channel
        for m in msgs:
            if m.get("author", {}).get("id") != me or not lfg_buttons(m) or last_activity(m) > cutoff:
                continue
            if dry:
                print(f"  ~ would expire {m['id']} in #{ch['name']}")
                continue
            try:
                d.call("PATCH", f"/channels/{ch['id']}/messages/{m['id']}", body={
                    "embeds": [expired_embed(e) for e in m.get("embeds", [])],
                    "components": [], "allowed_mentions": {"parse": []}})
                closed += 1
                print(f"  ⌛ expired a squad post in #{ch['name']}")
            except RuntimeError as e:
                print(f"  ! couldn't edit {m['id']} in #{ch['name']}: {e}")
            time.sleep(0.4)
    return closed


def main():
    ap = argparse.ArgumentParser(description="Expire stale Kit Up squad posts.")
    ap.add_argument("--minutes", type=int, default=60, help="minutes with no activity before a post expires")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    token, gid = os.environ.get("DISCORD_TOKEN"), os.environ.get("DISCORD_GUILD_ID")
    if not token or not gid:
        sys.exit("Set DISCORD_TOKEN and DISCORD_GUILD_ID.")
    n = run(token, gid, a.minutes, a.dry_run)
    print(f"Done. {n} squad post(s) expired.")


if __name__ == "__main__":
    main()
