"""Shared Kit Up bits for the Discord bot and the update poster.

Standard library only, so the GitHub Action can import it without installing
anything. Every embed builder returns a plain dict in Discord's embed format;
the bot turns them into discord.Embed objects with Embed.from_dict().
"""

import json
import os
import urllib.request

# Kit Up's palette, straight from index.html.
ACCENT = 0x9B7BFF      # --accent
ACCENT_TEXT = 0xB49DFF  # --accent-text
GOLD = 0xF2B726        # --gold-text
BUFF = 0x62BE7C        # --buff
NERF = 0xE8645A        # --nerf
ADJUST = 0x7AA9D6      # --adjust
SURFACE = 0x15121D     # --surface (as close to "dark" as an embed bar gets)

TIER_COLOR = {"S": GOLD, "A": ACCENT, "B": ADJUST}
TIER_DOT = {"S": "🟨", "A": "🟪", "B": "🟦"}
TYPE_ICON = {"buff": "🟢", "nerf": "🔴", "adjust": "🔵"}

SITE = os.environ.get("KITUP_URL", "").rstrip("/")


def site(path=""):
    """Full link into the app, or None if KITUP_URL isn't set."""
    if not SITE:
        return None
    return f"{SITE}/{path.lstrip('/')}" if path else SITE + "/"


def footer(text="Kit Up · MW4 companion"):
    f = {"text": text}
    if site():
        f["icon_url"] = site("icons/logo-192.png")
    return f


# ---------- data ----------

def load_json(name, data_dir=None, raw=None):
    """Read data/<name>.json from a folder, from given text, or from the live site."""
    if raw is not None:
        return json.loads(raw)
    if data_dir:
        with open(os.path.join(data_dir, f"{name}.json"), encoding="utf-8") as f:
            return json.load(f)
    url = site(f"data/{name}.json")
    if not url:
        raise RuntimeError("Set KITUP_URL (your Kit Up site) or KITUP_DATA_DIR (a local data folder).")
    req = urllib.request.Request(url, headers={"User-Agent": "KitUpBot/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


class Data:
    """A snapshot of the app's data files, with handy lookups."""

    def __init__(self, files):
        self.game = files.get("game", {})
        self.tiers = files.get("tiers", {})
        self.meta = files.get("meta", [])
        self.patches = files.get("patches", [])
        self.news = files.get("news", [])
        self.shop = files.get("shop", {})
        self.history = files.get("history", {})
        self.W = {w["id"]: w for w in self.game.get("weapons", [])}
        self.cats = {c["id"]: c for c in self.game.get("categories", [])}
        self.tier_of = {}
        for t in self.tiers.get("tiers", []):
            for gid in t.get("ids", []):
                self.tier_of[gid] = t["t"]

    def name(self, gid):
        return self.W.get(gid, {}).get("name", gid)

    def cat(self, gid):
        c = self.cats.get(self.W.get(gid, {}).get("cat"), {})
        return c.get("one", "")

    def pick(self, gid):
        p = self.tiers.get("picks", {}).get(gid)
        if p is None:
            p = self.W.get(gid, {}).get("pick")
        return p

    def find_gun(self, text):
        """Match a weapon by id or name, loosely."""
        if not text:
            return None
        t = text.strip().lower()
        if t in self.W:
            return t
        norm = lambda s: "".join(ch for ch in s.lower() if ch.isalnum())
        nt = norm(t)
        for gid, w in self.W.items():
            if norm(w["name"]) == nt or norm(gid) == nt:
                return gid
        for gid, w in self.W.items():
            if nt and (nt in norm(w["name"]) or nt in norm(gid)):
                return gid
        return None


# ---------- embeds ----------

def _pct(p):
    return "—" if p is None else f"{p:.1f}%"


def meta_embed(d, title="Live meta", movers=None):
    fields = []
    for t in d.tiers.get("tiers", []):
        ids = t.get("ids", [])
        if not ids:
            continue
        lines = [f"**{d.name(g)}** · {_pct(d.pick(g))}" for g in ids[:12]]
        fields.append({
            "name": f"{TIER_DOT.get(t['t'], '⬜')} {t['t']} tier · {t.get('label', '')}",
            "value": "\n".join(lines)[:1024],
            "inline": True,
        })
    if movers:
        fields.append({"name": "📈 Movers since last update", "value": movers[:1024], "inline": False})
    e = {
        "title": f"🎯 {title}",
        "description": "Pick rate = how often players run it, not raw power.",
        "color": ACCENT,
        "fields": fields,
        "footer": footer(f"Kit Up · updated {d.tiers.get('updated', '?')}"),
    }
    if site():
        e["url"] = site("#meta")
    return e


def movers_text(d, limit=5, min_delta=0.3):
    """Biggest pick-rate changes between the last two history snapshots."""
    days = d.history.get("days", [])
    if len(days) < 2:
        return None
    rows = []
    for gid, series in d.history.get("picks", {}).items():
        if len(series) >= 2 and series[-1] is not None and series[-2] is not None:
            delta = series[-1] - series[-2]
            if abs(delta) >= min_delta:
                rows.append((delta, gid, series[-1]))
    if not rows:
        return None
    rows.sort(key=lambda r: -abs(r[0]))
    out = []
    for delta, gid, now in rows[:limit]:
        arrow = "▲" if delta > 0 else "▼"
        out.append(f"{arrow} **{d.name(gid)}** {delta:+.1f} pts → {now:.1f}%")
    return "\n".join(out)


def tier_moves(old, new):
    """[(gun_id, old_tier_or_None, new_tier_or_None)] for guns whose tier changed."""
    o, n = old.tier_of, new.tier_of
    moves = []
    for gid in sorted(set(o) | set(n)):
        if o.get(gid) != n.get(gid):
            moves.append((gid, o.get(gid), n.get(gid)))
    ranked = {"S", "A", "B"}
    return [m for m in moves if (m[1] in ranked) or (m[2] in ranked)]


def tier_moves_text(d, moves):
    order = {"S": 0, "A": 1, "B": 2}
    lines = []
    for gid, a, b in moves:
        oa, ob = order.get(a, 3), order.get(b, 3)
        if oa == ob:
            continue
        up = ob < oa
        a = a if a in order else "unranked"
        b = b if b in order else "unranked"
        lines.append(f"{'⬆️' if up else '⬇️'} **{d.name(gid)}** {a} → {b}")
    return "\n".join(lines)


def gun_embed(d, gid):
    w = d.W[gid]
    L = w.get("live", {})
    tier = d.tier_of.get(gid)
    ms = lambda k: f"{L[k]} ms" if L.get(k) is not None else "—"
    fields = [
        {"name": "Meta", "value": f"{TIER_DOT.get(tier, '⬜')} {tier + ' tier' if tier else 'Unranked'}\nPicked {_pct(d.pick(gid))}", "inline": True},
        {"name": "TTK", "value": f"15 m · {ms('ttk15')}\n40 m · {ms('ttk40')}\n80 m · {ms('ttk80')}", "inline": True},
        {"name": "Handling", "value": f"ADS · {ms('ads')}\nSprint-to-fire · {ms('stf')}\nReload · {ms('reload')}", "inline": True},
        {"name": "Gun", "value": f"{L.get('rpm', w.get('rpm', '—'))} RPM · {L.get('mag', w.get('mag', '—'))} rounds\nUnlocks at level {w.get('unlock', '—')}", "inline": True},
    ]
    if w.get("apex"):
        fields.append({"name": f"Apex · {w['apex']['name']}", "value": w["apex"].get("about", "")[:1024], "inline": False})
    e = {
        "title": w["name"],
        "description": f"*{d.cat(gid)}* — {w.get('about', '')}",
        "color": TIER_COLOR.get(tier, ACCENT),
        "fields": fields,
        "footer": footer(),
    }
    if site():
        e["url"] = site(f"#g-{gid}")
        if w.get("photo"):
            e["image"] = {"url": site(w["photo"])}
    return e


def build_embeds(d, gid, limit=3):
    out = []
    for b in [b for b in d.meta if b.get("w") == gid][:limit]:
        atts = "\n".join(f"`{a['s']}` {a['n']}" for a in b.get("att", [])) or "Iron sights, no attachments."
        e = {
            "title": f"{b['name']}",
            "description": f"{b.get('role', '')}\n{b.get('note', '')}",
            "color": TIER_COLOR.get(b.get("tier"), ACCENT),
            "fields": [{"name": "Attachments", "value": atts[:1024], "inline": False}],
            "footer": footer("Tap the title to load this build in Kit Up"),
        }
        if site() and b.get("code"):
            e["url"] = site(f"#{b['code']}")
        out.append(e)
    return out


def range_text(d, meters, limit=5):
    buckets = [(15, "ttk15"), (40, "ttk40"), (80, "ttk80"), (100, "ttk100")]
    m, key = min(buckets, key=lambda b: abs(b[0] - meters))
    rows = [(w["live"][key], gid) for gid, w in d.W.items() if w.get("live", {}).get(key)]
    rows.sort()
    lines = [f"`{i+1}.` **{d.name(g)}** · {t} ms" for i, (t, g) in enumerate(rows[:limit])]
    return m, "\n".join(lines)


def patch_embed(p):
    lines = []
    for c in p.get("changes", [])[:20]:
        what = c.get("item") or c.get("weapon") or ""
        lines.append(f"{TYPE_ICON.get(c.get('type'), '⚪')} **{what}** — {c.get('text', '')}")
    fields = []
    if lines:
        chunk, size = [], 0
        for ln in lines:
            if size + len(ln) > 1000:
                fields.append({"name": "Changes" if not fields else "​", "value": "\n".join(chunk), "inline": False})
                chunk, size = [], 0
            chunk.append(ln)
            size += len(ln) + 1
        fields.append({"name": "Changes" if not fields else "​", "value": "\n".join(chunk), "inline": False})
    if p.get("modes"):
        fields.append({"name": "Modes", "value": "\n".join("• " + m for m in p["modes"][:8])[:1024], "inline": False})
    e = {
        "title": f"📋 {p.get('title', 'Patch notes')}",
        "description": f"**{p.get('season', '')}** · {p.get('date', '')}\n{p.get('summary', '')}",
        "color": ACCENT,
        "fields": fields,
        "footer": footer("🟢 buff · 🔴 nerf · 🔵 adjust"),
    }
    if p.get("url"):
        e["url"] = p["url"]
    return e


def patch_embed_named(d, p):
    """Same as patch_embed, with weapon ids swapped for gun names."""
    q = dict(p)
    q["changes"] = [dict(c, weapon=d.name(c["weapon"])) if c.get("weapon") else c for c in p.get("changes", [])]
    return patch_embed(q)


def news_embed(n):
    e = {
        "title": f"📰 {n.get('title', '')}",
        "description": n.get("body", ""),
        "color": ACCENT_TEXT,
        "footer": footer(f"{n.get('tag', 'News')} · {n.get('date') or 'Kit Up'}"),
    }
    if n.get("url"):
        e["url"] = n["url"]
    return e


def shop_embed(s):
    items = s.get("items", [])
    if not items:
        return {"title": "🛒 Store", "description": "Today's store isn't confirmed yet.", "color": ACCENT, "footer": footer()}
    fields = []
    for it in items[:10]:
        inside = ", ".join(it.get("items", []))
        price = f"{it['price']:,} {it.get('currency', 'CP')}" if isinstance(it.get("price"), (int, float)) else ""
        val = " · ".join(x for x in [it.get("type", ""), price] if x)
        if inside:
            val += f"\n{inside}"
        if it.get("note"):
            val += f"\n*{it['note']}*"
        fields.append({"name": it.get("name", "Item"), "value": val[:1024] or "​", "inline": False})
    e = {"title": f"🛒 Store · {s.get('date')}", "color": GOLD, "fields": fields, "footer": footer()}
    if site():
        e["url"] = site("#shop")
    return e
