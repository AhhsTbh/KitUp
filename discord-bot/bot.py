"""Kit Up bot: slash commands that read the live app data, plus the role buttons.

Run it somewhere that stays on (see README):
    DISCORD_TOKEN=... KITUP_URL=https://your-site python discord-bot/bot.py

Commands
  /meta              live tier list with pick rates and movers
  /gun <gun>         TTK, handling and meta status for one gun
  /build <gun>       the meta builds for a gun, one tap to load in Kit Up
  /range <meters>    fastest-killing guns at that distance
  /patch             latest patch notes
  /news              latest news
  /store             today's store
"""

import asyncio
import os
import sys
import time

import discord
from discord import app_commands

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitup_common as K  # noqa: E402
from roles_view import RoleView  # noqa: E402

TOKEN = os.environ.get("DISCORD_TOKEN")
GUILD_ID = int(os.environ.get("DISCORD_GUILD_ID", "0") or 0)
DATA_DIR = os.environ.get("KITUP_DATA_DIR")  # optional: read a local data/ folder instead of the site
CACHE_SECONDS = 600
FILES = ("game", "tiers", "meta", "patches", "news", "shop", "history")


class DataCache:
    def __init__(self):
        self.data = None
        self.at = 0
        self.lock = asyncio.Lock()

    async def get(self):
        async with self.lock:
            if self.data is None or time.time() - self.at > CACHE_SECONDS:
                try:
                    files = await asyncio.to_thread(
                        lambda: {n: K.load_json(n, DATA_DIR) for n in FILES})
                    self.data, self.at = K.Data(files), time.time()
                except Exception as e:  # keep serving the last good copy
                    if self.data is None:
                        raise
                    print(f"data refresh failed, using cached copy: {e}")
            return self.data


cache = DataCache()


class KitUp(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default(),
                         activity=discord.Activity(type=discord.ActivityType.watching, name="the meta · /meta"))
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        self.add_view(RoleView())  # keeps #pick-roles buttons alive across restarts
        if GUILD_ID:  # instant command updates in your server
            g = discord.Object(id=GUILD_ID)
            self.tree.copy_global_to(guild=g)
            await self.tree.sync(guild=g)
        else:
            await self.tree.sync()

    async def on_ready(self):
        print(f"Kit Up bot online as {self.user}")


bot = KitUp()


def app_button(label, path, emoji=None):
    if not K.site():
        return None
    v = discord.ui.View()
    v.add_item(discord.ui.Button(label=label, url=K.site(path), emoji=emoji))
    return v


def send_kw(embeds, view=None):
    kw = {"embeds": [discord.Embed.from_dict(e) for e in embeds]}
    if view:
        kw["view"] = view
    return kw


async def gun_autocomplete(interaction, current: str):
    d = await cache.get()
    cur = current.lower()
    hits = [(w["name"], gid) for gid, w in d.W.items() if cur in w["name"].lower() or cur in gid]
    hits.sort(key=lambda h: (d.tier_of.get(h[1], "Z"), h[0]))
    return [app_commands.Choice(name=n, value=g) for n, g in hits[:25]]


async def resolve_gun(interaction, gun):
    d = await cache.get()
    gid = d.find_gun(gun)
    if not gid:
        await interaction.response.send_message(f"Couldn't find a gun called **{gun}**.", ephemeral=True)
    return d, gid


@bot.tree.command(name="meta", description="Live MW4 meta: tiers, pick rates and movers")
async def meta_cmd(interaction: discord.Interaction):
    d = await cache.get()
    e = K.meta_embed(d, movers=K.movers_text(d))
    await interaction.response.send_message(**send_kw([e], app_button("Open the meta in Kit Up", "#meta", "🎯")))


@bot.tree.command(name="gun", description="TTK, handling and meta status for a gun")
@app_commands.describe(gun="Which gun")
@app_commands.autocomplete(gun=gun_autocomplete)
async def gun_cmd(interaction: discord.Interaction, gun: str):
    d, gid = await resolve_gun(interaction, gun)
    if gid:
        await interaction.response.send_message(**send_kw([K.gun_embed(d, gid)], app_button("Open in Kit Up", f"#g-{gid}")))


@bot.tree.command(name="build", description="Meta builds for a gun, ready to load in Kit Up")
@app_commands.describe(gun="Which gun")
@app_commands.autocomplete(gun=gun_autocomplete)
async def build_cmd(interaction: discord.Interaction, gun: str):
    d, gid = await resolve_gun(interaction, gun)
    if not gid:
        return
    embeds = K.build_embeds(d, gid)
    if not embeds:
        return await interaction.response.send_message(
            f"No meta builds for the **{d.name(gid)}** right now. Make your own in the loadout maker.",
            **({"view": app_button("Loadout maker", "#build")} if K.site() else {}))
    view = None
    if K.site():
        view = discord.ui.View()
        for b in [b for b in d.meta if b.get("w") == gid][:3]:
            url = K.site(f"#{b['code']}") if b.get("code") else None
            if url and len(url) <= 512:  # Discord's button link limit; the embed title link always works
                view.add_item(discord.ui.Button(label=f"Load {b['name']}"[:80], url=url))
        if not view.children:
            view.add_item(discord.ui.Button(label="Loadout maker", url=K.site("#build")))
    await interaction.response.send_message(**send_kw(embeds, view))


@bot.tree.command(name="range", description="Fastest-killing guns at a distance")
@app_commands.describe(meters="How far you usually fight, in meters")
async def range_cmd(interaction: discord.Interaction, meters: app_commands.Range[int, 1, 150]):
    d = await cache.get()
    m, text = K.range_text(d, meters)
    e = {"title": f"📏 Best TTK around {m} m", "description": text or "No data yet.",
         "color": K.ACCENT, "footer": K.footer("Kit Up · range finder")}
    await interaction.response.send_message(**send_kw([e], app_button("Range finder", "#range", "📏")))


@bot.tree.command(name="patch", description="Latest MW4 patch notes")
async def patch_cmd(interaction: discord.Interaction):
    d = await cache.get()
    if not d.patches:
        return await interaction.response.send_message("No patch notes yet.", ephemeral=True)
    await interaction.response.send_message(**send_kw([K.patch_embed_named(d, d.patches[0])],
                                                      app_button("All patch notes", "#patches", "📋")))


@bot.tree.command(name="news", description="Latest MW4 news")
async def news_cmd(interaction: discord.Interaction):
    d = await cache.get()
    items = sorted(d.news, key=lambda n: n.get("date") or "", reverse=True)[:3]
    if not items:
        return await interaction.response.send_message("No news yet.", ephemeral=True)
    await interaction.response.send_message(**send_kw([K.news_embed(n) for n in items]))


@bot.tree.command(name="store", description="Today's MW4 store")
async def store_cmd(interaction: discord.Interaction):
    d = await cache.get()
    await interaction.response.send_message(**send_kw([K.shop_embed(d.shop)], app_button("Store in Kit Up", "#shop", "🛒")))


@bot.tree.error
async def on_error(interaction: discord.Interaction, error):
    print(f"command error: {error!r}")
    msg = "Kit Up couldn't reach its data just now. Try again in a minute."
    if interaction.response.is_done():
        await interaction.followup.send(msg, ephemeral=True)
    else:
        await interaction.response.send_message(msg, ephemeral=True)


if __name__ == "__main__":
    if not TOKEN:
        sys.exit("Set DISCORD_TOKEN first (see discord-bot/README.md).")
    if not K.site() and not DATA_DIR:
        sys.exit("Set KITUP_URL to your Kit Up site so the bot can read its data.")
    bot.run(TOKEN)
