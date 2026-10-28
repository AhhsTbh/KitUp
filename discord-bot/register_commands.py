"""Register Kit Up's slash commands with Discord (run once, or after changing them).

    DISCORD_TOKEN=... DISCORD_GUILD_ID=... python discord-bot/register_commands.py
"""
import json
import os
import sys
import urllib.request

TOKEN = os.environ["DISCORD_TOKEN"]
GUILD = os.environ.get("DISCORD_GUILD_ID")
GUN = {"type": 3, "name": "gun", "description": "Which gun", "required": True, "autocomplete": True}
COMMANDS = [
    {"name": "meta", "description": "Live MW4 meta: tiers, pick rates and movers"},
    {"name": "gun", "description": "TTK, handling and meta status for a gun", "options": [GUN]},
    {"name": "build", "description": "Meta builds for a gun, ready to load in Kit Up", "options": [GUN]},
    {"name": "range", "description": "Fastest-killing guns at a distance", "options": [
        {"type": 4, "name": "meters", "description": "How far you usually fight, in meters",
         "required": True, "min_value": 1, "max_value": 150}]},
    {"name": "patch", "description": "Latest MW4 patch notes"},
    {"name": "news", "description": "Latest MW4 news"},
    {"name": "store", "description": "Today's MW4 store"},
    # Squad finder: link an Activision ID once, then post or join squads on any platform.
    {"name": "link", "description": "Link your Activision ID so you can find squads", "options": [
        {"type": 3, "name": "platform", "description": "Where you play", "required": True,
         "choices": [{"name": "Xbox", "value": "xbox"}, {"name": "PlayStation", "value": "ps"}, {"name": "PC", "value": "pc"}]},
        {"type": 3, "name": "activision", "description": "Your Activision ID, like Name#1234567", "required": True,
         "min_length": 3, "max_length": 40},
        {"type": 3, "name": "gamertag", "description": "Xbox gamertag, PSN ID or Battle.net name (optional)",
         "max_length": 30}]},
    {"name": "unlink", "description": "Remove your linked Activision ID"},
    {"name": "profile", "description": "See a player's linked Activision ID", "options": [
        {"type": 6, "name": "user", "description": "Who to look up (you, if left empty)"}]},
    {"name": "lfg", "description": "Find a squad for DMZ, Multiplayer or Warzone", "options": [
        {"type": 3, "name": "game", "description": "Which game", "required": True,
         "choices": [{"name": "DMZ", "value": "dmz"}, {"name": "Multiplayer", "value": "mp"}, {"name": "Warzone", "value": "wz"}]},
        {"type": 3, "name": "mode", "description": "Mode in that game (Multiplayer: Hardpoint, Gunfight...)", "autocomplete": True},
        {"type": 4, "name": "slots", "description": "Squad size (defaults: DMZ 3, Warzone 4, Gunfight 2, other modes 6)",
         "min_value": 2, "max_value": 6},
        {"type": 3, "name": "note", "description": "Vibe, mic, goals", "max_length": 100}]},
]


def api(path, method="GET", body=None):
    req = urllib.request.Request(f"https://discord.com/api/v10{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bot {TOKEN}", "Content-Type": "application/json",
                                          "User-Agent": "KitUpBot/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"null")


app = api("/applications/@me")["id"]
path = f"/applications/{app}/guilds/{GUILD}/commands" if GUILD else f"/applications/{app}/commands"
done = api(path, "PUT", COMMANDS)
print("Registered:", ", ".join("/" + c["name"] for c in done))
