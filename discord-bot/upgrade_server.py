"""One-time server upgrades, safe to run again:

1. Creates the opt-in 🔔 "LFG Pings" role (new /lfg posts ping it).
2. Adds a 🔔 LFG Pings button to the role picker in #🎨・pick-roles.
3. Creates the weekly "KitUp Squad Night" event (Fridays 8 PM Pacific) in 🎮 Squad 1,
   with the cover from cards/squad-night.png.

Usage (from discord-bot/, standard library only):
    DISCORD_TOKEN=... DISCORD_GUILD_ID=... python upgrade_server.py

Or on GitHub: Actions → Discord upgrades → Run workflow.
"""

import base64
import datetime as dt
import os
import sys
from zoneinfo import ZoneInfo

from pin_cards import Discord

HERE = os.path.dirname(os.path.abspath(__file__))
ROLE = "LFG Pings"
ROLE_COLOUR = 0x9B7BFF
ADMIN, MENTION_EVERYONE = 1 << 3, 1 << 17

PICK_ROLES = "🎨・pick-roles"
ROWS = [[("pc", "PC", "🖥️"), ("ps", "PlayStation", "🎮"), ("xbox", "Xbox", "🟩")],
        [("mp", "Multiplayer", "🎯"), ("dmz", "DMZ", "☢️"), ("wz", "Warzone", "🪂")],
        [("patch", "Patch Alerts", "📋"), ("meta", "Meta Alerts", "📈"), ("lfg", "LFG Pings", "🔔")]]
PINGS_LINE = "**Pings** · 📋 Patch Alerts (new patch notes) · 📈 Meta Alerts (tier changes) · 🔔 LFG Pings (new squad posts)"

EVENT = "KitUp Squad Night"
EVENT_VOICE = "🎮 Squad 1"
EVENT_DESC = ("Weekly squad night for KitUp N Lounge. Xbox, PlayStation and PC all welcome.\n"
              "Post with /lfg multiplayer, /lfg dmz or /lfg warzone, tap Join, then hop in voice. "
              "Turn on 🔔 LFG Pings in #pick-roles so you never miss a squad.")
TZ = ZoneInfo("America/Los_Angeles")
WEEKDAY, HOUR, LENGTH_H = 4, 20, 3  # Friday (Mon=0), 8 PM, 3 hours


def ensure_role(d, gid):
    roles = d.call("GET", f"/guilds/{gid}/roles")
    me = d.call("GET", "/users/@me")["id"]
    member = d.call("GET", f"/guilds/{gid}/members/{me}")
    perms = 0
    for r in roles:
        if r["id"] in member.get("roles", []) or r["id"] == gid:  # gid is @everyone
            perms |= int(r["permissions"])
    can_ping = bool(perms & (ADMIN | MENTION_EVERYONE))
    role = next((r for r in roles if r["name"] == ROLE), None)
    if role:
        print(f"  · role {ROLE} already exists")
    else:
        role = d.call("POST", f"/guilds/{gid}/roles", body={
            "name": ROLE, "color": ROLE_COLOUR, "hoist": False, "permissions": "0",
            # Members can't @ it themselves unless the bot needs that to ping it.
            "mentionable": not can_ping})
        print(f"  + created role {ROLE}")
    if not can_ping and not role.get("mentionable"):
        d.call("PATCH", f"/guilds/{gid}/roles/{role['id']}", body={"mentionable": True})
        print(f"  ~ made {ROLE} mentionable (the bot doesn't have Mention @everyone)")
    return role


def update_picker(d, gid, me):
    chans = {c["name"]: c for c in d.call("GET", f"/guilds/{gid}/channels")}
    ch = chans.get(PICK_ROLES)
    if not ch:
        print(f"  ! #{PICK_ROLES} not found")
        return
    msgs = d.call("GET", f"/channels/{ch['id']}/messages?limit=50") or []
    picker = next((m for m in msgs if m.get("author", {}).get("id") == me and any(
        c.get("custom_id", "").startswith("kitup:role:")
        for row in m.get("components", []) for c in row.get("components", []))), None)
    if not picker:
        print(f"  ! role picker message not found in #{PICK_ROLES} (run setup_server.py)")
        return
    has = any(c.get("custom_id") == "kitup:role:lfg" for row in picker["components"] for c in row["components"])
    embeds = picker.get("embeds", [])
    for e in embeds:
        desc = e.get("description", "")
        lines = [PINGS_LINE if ln.startswith("**Pings**") else ln for ln in desc.split("\n")]
        e["description"] = "\n".join(lines)
        for k in ("type", "video", "provider"):
            e.pop(k, None)
    components = [{"type": 1, "components": [
        {"type": 2, "style": 2, "label": label, "emoji": {"name": emoji}, "custom_id": f"kitup:role:{key}"}
        for key, label, emoji in row]} for row in ROWS]
    d.call("PATCH", f"/channels/{ch['id']}/messages/{picker['id']}",
           body={"embeds": embeds, "components": components, "allowed_mentions": {"parse": []}})
    print("  · LFG Pings button was already there, picker refreshed" if has else "  + added 🔔 LFG Pings to the role picker")


def next_slot(now):
    local = now.astimezone(TZ)
    days = (WEEKDAY - local.weekday()) % 7
    start = (local + dt.timedelta(days=days)).replace(hour=HOUR, minute=0, second=0, microsecond=0)
    if start <= local:
        start += dt.timedelta(days=7)
    return start


def iso(t):
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def ensure_event(d, gid):
    events = d.call("GET", f"/guilds/{gid}/scheduled-events") or []
    if any(e["name"] == EVENT and e.get("recurrence_rule") for e in events):
        print(f"  · {EVENT} is already scheduled")
        return
    chans = {c["name"]: c for c in d.call("GET", f"/guilds/{gid}/channels")}
    voice = chans.get(EVENT_VOICE)
    if not voice:
        print(f"  ! voice channel {EVENT_VOICE} not found")
        return
    with open(os.path.join(HERE, "cards", "squad-night.png"), "rb") as f:
        image = "data:image/png;base64," + base64.b64encode(f.read()).decode()

    first = next_slot(dt.datetime.now(dt.timezone.utc))
    # Discord repeats an event at the same UTC time, so a series that crosses a daylight
    # saving change would drift an hour. If the clocks change before next week, book this
    # Friday on its own and start the weekly series the week after.
    week = first + dt.timedelta(days=7)
    series = first
    if first.utcoffset() != week.astimezone(TZ).replace(hour=HOUR).utcoffset():
        if not any(e["name"] == EVENT and e["scheduled_start_time"].startswith(iso(first)[:16]) for e in events):
            d.call("POST", f"/guilds/{gid}/scheduled-events", body={
                "name": EVENT, "description": EVENT_DESC, "privacy_level": 2, "entity_type": 2,
                "channel_id": voice["id"], "image": image,
                "scheduled_start_time": iso(first), "scheduled_end_time": iso(first + dt.timedelta(hours=LENGTH_H))})
            print(f"  + booked {EVENT} for {first:%a %b %d, %I %p %Z}")
        series = week.astimezone(TZ).replace(hour=HOUR, minute=0)
    d.call("POST", f"/guilds/{gid}/scheduled-events", body={
        "name": EVENT, "description": EVENT_DESC, "privacy_level": 2, "entity_type": 2,
        "channel_id": voice["id"], "image": image,
        "scheduled_start_time": iso(series), "scheduled_end_time": iso(series + dt.timedelta(hours=LENGTH_H)),
        "recurrence_rule": {"start": iso(series), "frequency": 2, "interval": 1, "by_weekday": [WEEKDAY]}})
    print(f"  + {EVENT} every Friday at 8 PM Pacific, starting {series:%a %b %d, %I %p %Z}")


def main():
    token, gid = os.environ.get("DISCORD_TOKEN"), os.environ.get("DISCORD_GUILD_ID")
    if not token or not gid:
        sys.exit("Set DISCORD_TOKEN and DISCORD_GUILD_ID. On GitHub: Settings → Secrets and variables → Actions.")
    d = Discord(token)
    me = d.call("GET", "/users/@me")["id"]
    print("Upgrading KitUp N Lounge…")
    ensure_role(d, gid)
    update_picker(d, gid, me)
    try:
        ensure_event(d, gid)
    except RuntimeError as e:
        if "403" in str(e):
            print("  ! the bot needs the Manage Events permission to create Squad Night. "
                  "Server Settings → Roles → the Kit Up bot's role → turn on Manage Events / Create Events, then run this again.")
        else:
            raise
    print("Done.")


if __name__ == "__main__":
    main()
