"""Post a Kit Up art card in each text channel and pin it there.

The cards live in discord-bot/cards/. Each one is posted by the Kit Up bot as an
image, pinned in its channel, and the "Kit Up pinned a message" notice is
cleaned up so the channel stays tidy.

Safe to run again: a channel that already has its card pinned is skipped.
Pass --refresh to swap the old card for the current image (after editing a card).

Usage (from the repo root, standard library only):
    DISCORD_TOKEN=... DISCORD_GUILD_ID=... python discord-bot/pin_cards.py [--refresh] [--only lounge]

Or on GitHub: Actions → Discord cards → Run workflow (needs the DISCORD_TOKEN and
DISCORD_GUILD_ID repo secrets).
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

API = os.environ.get("DISCORD_API", "https://discord.com/api/v10").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
CARD_DIR = os.path.join(HERE, "cards")
MARK = "kitup-card-"  # our cards are uploaded with this file name prefix, so we can find them again

# channel (exactly as setup_server.py names it) -> (card image, alt text)
CARDS = {
    "👋・welcome": ("welcome.png", "Welcome to the lounge. Grab roles in #pick-roles, hang in #lounge, find a squad in #lfg-multiplayer, ask the bot in #ask-kit-up."),
    "📜・house-rules": ("house-rules.png", "House rules: be chill, no cheats or account selling, right channel, no spam or self-promo, keep it SFW, follow Discord's Terms."),
    "🎨・pick-roles": ("pick-roles.png", "Pick your roles: platform, what you play and which pings you want. Tap to add, tap again to drop."),
    "🎯・meta-updates": ("meta-updates.png", "Live meta, every day: S, A and B tiers with pick rates and daily movers, posted by the Kit Up app."),
    "📋・patch-notes": ("patch-notes.png", "Patch notes: official MW4 patch notes the moment the app gets them, with buff, nerf and adjust markers."),
    "📰・news": ("news.png", "MW4 news: official Modern Warfare 4 news, posted automatically."),
    "🛒・store": ("store.png", "Today's store: the day's MW4 store, posted once it's confirmed."),
    "🛋️・lounge": ("lounge.png", "The lounge: talk about whatever. Want voice? Hop on The Couch."),
    "🎬・clips": ("clips.png", "Clips: your best (and worst) moments."),
    "😂・memes": ("memes.png", "Memes: low effort, high reward. Keep it SFW."),
    "🎧・now-playing": ("now-playing.png", "Now playing: what's in your headset."),
    "🔧・build-share": ("build-share.png", "Build share: build in the Kit Up loadout maker, copy the share link and paste it here."),
    "🧠・meta-talk": ("meta-talk.png", "Meta talk: is it broken or are you just good?"),
    "🤖・ask-kit-up": ("ask-kit-up.png", "Ask Kit Up: /meta /gun /build /range /patch /news /store."),
    "🎮・lfg-multiplayer": ("lfg-multiplayer.png", "Find a squad: post platform, mode and vibe, then jump in Squad 1 or Squad 2."),
    "☢️・lfg-dmz": ("lfg-dmz.png", "DMZ infil: post your platform and what you're running for, then squad up in DMZ Infil."),
}

TEXT_TYPES = {0, 5}  # text and announcement channels
PIN_NOTICE = 6       # message type of "X pinned a message to this channel"


class Discord:
    def __init__(self, token):
        self.token = token

    def call(self, method, path, body=None, files=None, ok404=False):
        """One API call with JSON or multipart body. Waits out rate limits."""
        url = API + path
        for attempt in range(6):
            headers = {"Authorization": f"Bot {self.token}", "User-Agent": "KitUpBot (https://kitup.gg, 1.0)"}
            data = None
            if files:
                boundary = uuid.uuid4().hex
                parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n'
                         f'Content-Type: application/json\r\n\r\n{json.dumps(body)}\r\n'.encode("utf-8")]
                for i, (name, blob) in enumerate(files):
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="files[{i}]"; filename="{name}"\r\n'
                                 f'Content-Type: image/png\r\n\r\n'.encode("utf-8") + blob + b"\r\n")
                parts.append(f"--{boundary}--\r\n".encode("utf-8"))
                data = b"".join(parts)
                headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            elif body is not None:
                data = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                raw = e.read()
                if e.code == 429:
                    wait = 1.0
                    try:
                        wait = float(json.loads(raw).get("retry_after", 1.0))
                    except (ValueError, AttributeError):
                        pass
                    time.sleep(wait + 0.25)
                    continue
                if e.code in (404, 405) and ok404:
                    return False
                raise RuntimeError(f"{method} {path} → {e.code} {raw[:300]!r}") from None
        raise RuntimeError(f"{method} {path} → still rate limited after retries")

    # Discord moved pins to /messages/pins in 2025; fall back to the older routes if needed.
    def pinned(self, cid):
        r = self.call("GET", f"/channels/{cid}/messages/pins?limit=50", ok404=True)
        if r is False:
            return self.call("GET", f"/channels/{cid}/pins") or []
        return [item["message"] for item in r.get("items", [])]

    def pin(self, cid, mid):
        if self.call("PUT", f"/channels/{cid}/messages/pins/{mid}", ok404=True) is False:
            self.call("PUT", f"/channels/{cid}/pins/{mid}")


def is_card(msg, me):
    # Any image the bot itself pinned counts as a card, whatever its file name, so older
    # cards (posted before the MARK prefix existed, or by an earlier script) get replaced too.
    return msg.get("author", {}).get("id") == me and any(
        a.get("filename", "").startswith(MARK) or (a.get("content_type") or "").startswith("image/")
        for a in msg.get("attachments", []))


def run(token, guild_id, refresh=False, only=None, dry=False):
    d = Discord(token)
    me = d.call("GET", "/users/@me")["id"]
    chans = {c["name"]: c for c in d.call("GET", f"/guilds/{guild_id}/channels") if c.get("type") in TEXT_TYPES}
    done = 0
    for name, (fname, alt) in CARDS.items():
        if only and not any(o.lower() in name.lower() for o in only):
            continue
        ch = chans.get(name)
        if not ch:
            print(f"  ! #{name} not found, skipped (run setup_server.py to create it)")
            continue
        path = os.path.join(CARD_DIR, fname)
        if not os.path.exists(path):
            print(f"  ! missing card image {fname}")
            continue
        cid = ch["id"]
        pins = d.pinned(cid)
        mine = [m for m in pins if is_card(m, me)]
        print(f"    #{name}: {len(pins)} pinned, {len(mine)} are the bot's cards"
              + "".join(f" [{(m.get('author') or {}).get('username')}: " + ",".join(a.get('filename', '?') for a in m.get('attachments', [])) + "]"
                        for m in pins if not is_card(m, me)))
        if mine and not refresh:
            print(f"  · #{name} already has its card pinned")
            continue
        if dry:
            print(f"  ~ #{name} would {'replace' if mine else 'post and pin'} {fname}")
            continue
        for m in mine:  # deleting a message also unpins it
            d.call("DELETE", f"/channels/{cid}/messages/{m['id']}")
        with open(path, "rb") as f:
            blob = f.read()
        upload = MARK + fname
        msg = d.call("POST", f"/channels/{cid}/messages",
                     body={"attachments": [{"id": 0, "filename": upload, "description": alt[:1024]}],
                           "allowed_mentions": {"parse": []}},
                     files=[(upload, blob)])
        d.pin(cid, msg["id"])
        # Tidy up the "Kit Up pinned a message" notice Discord drops in the channel.
        time.sleep(0.6)
        for m in d.call("GET", f"/channels/{cid}/messages?limit=10") or []:
            if m.get("type") == PIN_NOTICE and (m.get("message_reference") or {}).get("message_id") == msg["id"]:
                d.call("DELETE", f"/channels/{cid}/messages/{m['id']}")
        print(f"  + #{name} {'card replaced' if mine else 'card pinned'}")
        done += 1
        time.sleep(0.5)
    return done


def main():
    ap = argparse.ArgumentParser(description="Post and pin the Kit Up channel cards.")
    ap.add_argument("--refresh", action="store_true", help="replace cards that are already pinned")
    ap.add_argument("--only", nargs="*", help="only these channels (part of the name is enough)")
    ap.add_argument("--dry-run", action="store_true", help="show what would happen without posting")
    a = ap.parse_args()
    token, guild = os.environ.get("DISCORD_TOKEN"), os.environ.get("DISCORD_GUILD_ID")
    if not token or not guild:
        sys.exit("Set DISCORD_TOKEN and DISCORD_GUILD_ID. On GitHub: Settings → Secrets and variables → Actions.")
    print("Pinning the Kit Up channel cards…")
    n = run(token, guild, refresh=a.refresh, only=a.only, dry=a.dry_run)
    print(f"Done. {n} card(s) posted.")


if __name__ == "__main__":
    main()
