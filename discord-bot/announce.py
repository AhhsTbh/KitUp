"""Post Kit Up data changes to Discord webhooks.

Runs in GitHub Actions after every push to main that touches data/ (so the
daily data update feeds Discord on its own). Compares the data before and
after the push and posts:
  meta-updates  the live tier list + movers, with a ping when a gun changes tier;
                new guns and new meta builds; the Warzone meta when it changes
  patch-notes   each new patch entry (pings Patch Alerts)
  news          each new news item
  store         the store, when a new confirmed day lands

Standard library only. Try it without posting:
    python discord-bot/announce.py --before HEAD~1 --after HEAD --dry-run
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitup_common as K  # noqa: E402

FILES = ("game", "tiers", "meta", "patches", "news", "shop", "history", "warzone-stats", "loadouts")


def git_json(rev, name):
    try:
        out = subprocess.run(["git", "show", f"{rev}:data/{name}.json"], capture_output=True, check=True)
        return json.loads(out.stdout.decode("utf-8"))
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def snapshot(rev):
    files = {}
    for n in FILES:
        v = git_json(rev, n)
        if v is not None:
            files[n] = v
    return K.Data(files)


def hook(name):
    return os.environ.get(f"DISCORD_WEBHOOK_{name}") or os.environ.get("DISCORD_WEBHOOK")


def post(url, embeds, content=None, role_id=None, dry=False, label=""):
    if not embeds:
        return
    for i in range(0, len(embeds), 10):  # Discord allows 10 embeds per message
        body = {"username": "Kit Up", "embeds": embeds[i:i + 10],
                "allowed_mentions": {"parse": [], "roles": [role_id] if role_id else []}}
        if K.site():
            body["avatar_url"] = K.site("icons/logo-192.png")
        if content and i == 0:
            body["content"] = content
        if dry or not url:
            print(f"--- {label} ({'dry run' if dry else 'no webhook set, skipped'}) ---")
            print(json.dumps(body, ensure_ascii=False, indent=1)[:3000])
            continue
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
                                     headers={"Content-Type": "application/json", "User-Agent": "KitUpBot/1.0"})
        try:
            urllib.request.urlopen(req, timeout=20).read()
            print(f"posted {label}")
        except urllib.error.HTTPError as e:
            print(f"!! {label} failed: {e.code} {e.read()[:300]!r}")


def key(item):
    return (item.get("date"), item.get("title"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", default="HEAD~1")
    ap.add_argument("--after", default="HEAD")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--warzone", action="store_true", help="post the Warzone meta even if it didn't change")
    a = ap.parse_args()

    old, new = snapshot(a.before), snapshot(a.after)
    dry = a.dry_run
    patch_role = os.environ.get("DISCORD_PATCH_ROLE_ID") or None
    meta_role = os.environ.get("DISCORD_META_ROLE_ID") or None

    # Meta: post when the tier list was refreshed or a gun changed tier.
    moved = K.tier_moves(old, new) if old.tiers else []
    if new.tiers.get("updated") and (new.tiers.get("updated") != old.tiers.get("updated") or moved):
        moves = K.tier_moves(old, new) if old.tiers else []
        e = K.meta_embed(new, movers=K.movers_text(new))
        content = None
        if moves:
            e["fields"].insert(0, {"name": "🔀 Tier moves", "value": K.tier_moves_text(new, moves)[:1024], "inline": False})
            content = (f"<@&{meta_role}> " if meta_role else "") + "The tier list shifted today."
        post(hook("META"), [e], content, meta_role if moves else None, dry, "meta")

    # New guns, each with its meta builds.
    added = [gid for gid in new.W if gid not in old.W] if old.W else []
    for gid in added:
        embeds = [K.new_gun_embed(new, gid)] + K.build_embeds(new, gid)
        post(hook("META"), embeds, None, None, dry, f"new gun {gid}")

    # Meta builds for guns that had none before (a new gun's builds can land a day later).
    had = {b.get("w") for b in old.meta}
    for gid in dict.fromkeys(b.get("w") for b in new.meta):
        if gid and gid not in had and gid not in added and gid in new.W:
            e = K.build_embeds(new, gid)
            if e:
                e[0] = dict(e[0], title=f"🛠️ New meta build: {e[0]['title']}")
            post(hook("META"), e, None, None, dry, f"builds {gid}")

    # Warzone meta: when a gun's Warzone status changes (or on request).
    if new.wz.get("guns"):
        wz_moves = K.wz_moves(old, new) if old.wz.get("guns") else ""
        if wz_moves or a.warzone:
            content = ((f"<@&{meta_role}> " if meta_role else "") + "The Warzone meta shifted.") if wz_moves else None
            post(hook("META"), [K.wz_meta_embed(new, moves=wz_moves or None)], content, meta_role if wz_moves else None, dry, "warzone meta")

    # Patch notes: anything not in the old file.
    seen = {key(p) for p in old.patches}
    fresh = [p for p in new.patches if key(p) not in seen]
    for p in reversed(fresh):  # oldest first, so the newest ends up at the bottom of the channel
        content = f"<@&{patch_role}>" if patch_role else None
        post(hook("PATCHES"), [K.patch_embed_named(new, p)], content, patch_role, dry, f"patch {p.get('title')}")

    # News.
    seen = {key(n) for n in old.news}
    fresh = [n for n in new.news if key(n) not in seen]
    fresh.sort(key=lambda n: n.get("date") or "")
    post(hook("NEWS"), [K.news_embed(n) for n in fresh], None, None, dry, "news")

    # Store: only a new, confirmed day.
    if new.shop.get("date") and new.shop.get("items") and new.shop.get("date") != old.shop.get("date"):
        post(hook("STORE"), [K.shop_embed(new.shop)], None, None, dry, "store")


if __name__ == "__main__":
    main()
