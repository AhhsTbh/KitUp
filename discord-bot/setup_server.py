"""Build the Kit Up Discord server in one go.

Usage (from the repo root):
    pip install -r discord/requirements.txt
    DISCORD_TOKEN=... DISCORD_GUILD_ID=... KITUP_URL=https://your-site python discord/setup_server.py

Safe to run again: anything that already exists (matched by name) is reused,
so a second run fills in whatever is missing instead of making duplicates.
"""

import asyncio
import datetime
import os
import sys

import discord

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitup_common as K  # noqa: E402
import pin_cards  # noqa: E402
from roles_view import RoleView, SELF_ROLES  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN = os.environ.get("DISCORD_TOKEN")
GUILD_ID = int(os.environ.get("DISCORD_GUILD_ID", "0") or 0)

# ---------- the layout ----------

STAFF_ROLES = [
    # name, colour, hoist, admin?
    ("HQ", K.GOLD, True, True),
    ("Overwatch", K.ACCENT_TEXT, True, False),
]

READ_ONLY = "read_only"
LAYOUT = [
    ("👋 START HERE", READ_ONLY, [
        ("text", "👋・welcome", "Grab a seat. Everything Kit Up starts here."),
        ("text", "📜・house-rules", "Short list. Be cool."),
        ("text", "🎨・pick-roles", "Platform, modes and pings. Tap to toggle."),
    ]),
    ("📡 KIT UP FEED", READ_ONLY, [
        ("text", "🎯・meta-updates", "Daily live meta from the app: tiers, pick rates, movers."),
        ("text", "📋・patch-notes", "Official MW4 patch notes the moment the app gets them."),
        ("text", "📰・news", "Official MW4 news."),
        ("text", "🛒・store", "Today's store, when it's confirmed."),
    ]),
    ("🛋️ THE LOUNGE", None, [
        ("text", "🛋️・lounge", "The couch. Talk about whatever."),
        ("text", "🎬・clips", "Your best (and worst) moments."),
        ("text", "😂・memes", "Low effort, high reward."),
        ("text", "🎧・now-playing", "What's in your headset."),
    ]),
    ("🔧 LOADOUTS", None, [
        ("text", "🔧・build-share", "Drop a Kit Up share link so others can load it in one tap."),
        ("text", "🧠・meta-talk", "Is it broken or are you just good?"),
        ("text", "🤖・ask-kit-up", "Bot commands live here: /meta /gun /build /range /patch /news /store."),
    ]),
    ("🎮 SQUAD UP", None, [
        ("text", "🎮・lfg-multiplayer", "Need a squad? Post platform, mode and vibe."),
        ("text", "☢️・lfg-dmz", "Infil buddies for DMZ."),
        ("voice", "🛋️ The Couch", 0),
        ("voice", "🎮 Squad 1", 6),
        ("voice", "🎮 Squad 2", 6),
        ("voice", "☢️ DMZ Infil", 4),
        ("voice", "💤 AFK", 0),
    ]),
]

STAFF_ONLY = "staff_only"
LAYOUT.append(("🛡️ HQ", STAFF_ONLY, [
    ("text", "🛡️・mod-log", "AutoMod alerts land here. Staff only."),
    ("text", "💬・staff-chat", "HQ and Overwatch only."),
]))

# Scam phrases hacked accounts and spam bots post. Matched anywhere in a message.
SCAM_WORDS = [
    "*free nitro*", "*nitro for free*", "*gift nitro*", "*nitro gift*", "*steam gift*",
    "*claim your gift*", "*airdrop*", "*free skins*", "*free cod points*", "*free cp*",
    "*onlyfans*", "*18+ server*", "*nsfw server*", "*dm me for*", "*@everyone free*",
]
INVITE_REGEX = [r"discord(app)?\.(gg|com/invite|me|io|li)/\S+", r"dsc\.gg/\S+"]

WEBHOOK_CHANNELS = {
    "DISCORD_WEBHOOK_META": "🎯・meta-updates",
    "DISCORD_WEBHOOK_PATCHES": "📋・patch-notes",
    "DISCORD_WEBHOOK_NEWS": "📰・news",
    "DISCORD_WEBHOOK_STORE": "🛒・store",
}

WELCOME = (
    "Pull up a chair. This is the hangout for **Kit Up**, the Modern Warfare 4 companion app — "
    "live meta, TTK and handling for every gun, builds you can load in one tap, DMZ, camos and patch notes.\n\n"
    "**Get comfy**\n"
    "› Grab your platform and pings in {roles}\n"
    "› Hang out in {lounge} or jump on **🛋️ The Couch**\n"
    "› Find a squad in {lfg}\n"
    "› Ask the bot anything in {ask} — try `/meta` or `/build m4`\n\n"
    "The **📡 Kit Up Feed** fills itself every day straight from the app."
)

RULES = [
    "Be chill. No harassment, slurs or drama-farming.",
    "No cheats, unlocks tools or account selling.",
    "Keep it in the right channel. Clips in clips, LFG in LFG.",
    "No spam or self-promo without asking HQ.",
    "Keep it SFW.",
    "Follow Discord's Terms of Service and Community Guidelines.",
]


# ---------- helpers ----------

async def get_role(guild, name, **kw):
    r = discord.utils.get(guild.roles, name=name)
    if r:
        await r.edit(**kw)
        return r
    print(f"  + role {name}")
    return await guild.create_role(name=name, **kw)


async def ensure_text(guild, cat, name, topic, overwrites):
    ch = discord.utils.get(guild.text_channels, name=name)
    if ch:
        await ch.edit(category=cat, topic=topic, overwrites=overwrites)
        return ch
    print(f"  + #{name}")
    return await guild.create_text_channel(name, category=cat, topic=topic, overwrites=overwrites)


async def ensure_voice(guild, cat, name, limit):
    ch = discord.utils.get(guild.voice_channels, name=name)
    if ch:
        await ch.edit(category=cat, user_limit=limit)
        return ch
    print(f"  + 🔊 {name}")
    return await guild.create_voice_channel(name, category=cat, user_limit=limit)


async def post_once(channel, me, marker, **kw):
    """Post a message unless the bot already posted one with this marker in its embed footer."""
    async for m in channel.history(limit=30):
        if m.author.id == me.id and m.embeds and (m.embeds[0].footer.text or "").endswith(marker):
            await m.edit(**kw)
            return m
    return await channel.send(**kw)


def read(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


# ---------- anti-spam ----------

async def secure(guild, roles, chans):
    """Verification level, content filter, @everyone lockdown and AutoMod rules."""
    print("Locking down against spam…")
    await guild.edit(
        verification_level=discord.VerificationLevel.medium,        # verified email + Discord account 5+ min old; no wait once they join
        explicit_content_filter=discord.ContentFilter.all_members,  # scan everyone's images
        default_notifications=discord.NotificationLevel.only_mentions,
    )
    # Regular members can't ping @everyone/@here or every role at once.
    p = guild.default_role.permissions
    p.update(mention_everyone=False)
    await guild.default_role.edit(permissions=p)

    log = chans["🛡️・mod-log"]
    staff = [roles["HQ"], roles["Overwatch"]]
    A = discord.AutoModRuleAction
    T = discord.AutoModRuleTriggerType
    block = lambda msg: A(type=discord.AutoModRuleActionType.block_message, custom_message=msg)
    alert = A(type=discord.AutoModRuleActionType.send_alert_message, channel_id=log.id)
    timeout = lambda mins: A(type=discord.AutoModRuleActionType.timeout, duration=datetime.timedelta(minutes=mins))

    rules = [
        ("Kit Up · spam", discord.AutoModTrigger(type=T.spam),
         [block("Looks like spam. Chill for a sec."), alert]),
        ("Kit Up · mass mentions", discord.AutoModTrigger(type=T.mention_spam, mention_limit=5, mention_raid_protection=True),
         [block("Too many pings in one message."), alert, timeout(60)]),
        ("Kit Up · scams", discord.AutoModTrigger(type=T.keyword, keyword_filter=SCAM_WORDS),
         [block("That looks like a scam, so it was blocked. If your account got hacked, change your password."), alert, timeout(60 * 24)]),
        ("Kit Up · server invites", discord.AutoModTrigger(type=T.keyword, regex_patterns=INVITE_REGEX),
         [block("No server invites here. Ask HQ first."), alert]),
        ("Kit Up · slurs & NSFW", discord.AutoModTrigger(
            type=T.keyword_preset, presets=discord.AutoModPresets(slurs=True, sexual_content=True)),
         [block("Keep it cool. That word isn't allowed here."), alert]),
    ]
    existing = {r.name: r for r in await guild.fetch_automod_rules()}
    for name, trigger, actions in rules:
        kw = dict(trigger=trigger, actions=actions, enabled=True, exempt_roles=staff)
        if name in existing:
            await existing[name].edit(**kw)
        else:
            print(f"  + AutoMod: {name}")
            await guild.create_automod_rule(name=name, event_type=discord.AutoModRuleEventType.message_send, **kw)


# ---------- main ----------

async def build(client):
    guild = client.get_guild(GUILD_ID) or await client.fetch_guild(GUILD_ID)
    me = guild.me or await guild.fetch_member(client.user.id)
    print(f"Building Kit Up in '{guild.name}'…")

    # Roles: staff first, then the self-assign ones.
    roles = {}
    for name, colour, hoist, admin in STAFF_ROLES:
        perms = discord.Permissions.all() if admin else discord.Permissions(
            manage_messages=True, kick_members=True, moderate_members=True, mute_members=True,
            move_members=True, manage_threads=True)
        roles[name] = await get_role(guild, name, colour=discord.Colour(colour), hoist=hoist,
                                     mentionable=False, permissions=perms)
    for key, (label, emoji, colour) in SELF_ROLES.items():
        roles[label] = await get_role(guild, label, colour=discord.Colour(colour), mentionable=True,
                                      permissions=discord.Permissions.none())

    everyone = guild.default_role
    read_only = {
        everyone: discord.PermissionOverwrite(send_messages=False, add_reactions=True,
                                              create_public_threads=False, create_private_threads=False),
        roles["HQ"]: discord.PermissionOverwrite(send_messages=True),
        roles["Overwatch"]: discord.PermissionOverwrite(send_messages=True),
        me: discord.PermissionOverwrite(send_messages=True, manage_webhooks=True, embed_links=True),
    }

    staff_only = {
        everyone: discord.PermissionOverwrite(view_channel=False),
        roles["HQ"]: discord.PermissionOverwrite(view_channel=True),
        roles["Overwatch"]: discord.PermissionOverwrite(view_channel=True),
        me: discord.PermissionOverwrite(view_channel=True, send_messages=True),
    }

    chans = {}
    for pos, (cat_name, mode, items) in enumerate(LAYOUT):
        cat = discord.utils.get(guild.categories, name=cat_name)
        ow = read_only if mode == READ_ONLY else staff_only if mode == STAFF_ONLY else {}
        if cat:
            await cat.edit(overwrites=ow, position=pos)
        else:
            print(f"+ {cat_name}")
            cat = await guild.create_category(cat_name, overwrites=ow, position=pos)
        for kind, name, extra in items:
            if kind == "text":
                chans[name] = await ensure_text(guild, cat, name, extra, ow)
            else:
                chans[name] = await ensure_voice(guild, cat, name, extra)

    # Slowmode on the busy chat channels keeps things mellow.
    for name in ("🎮・lfg-multiplayer", "☢️・lfg-dmz", "🔧・build-share"):
        await chans[name].edit(slowmode_delay=30)

    # Server look: Kit Up logo, AFK room, join messages in the lounge.
    edit = dict(afk_channel=chans["💤 AFK"], afk_timeout=900, system_channel=chans["🛋️・lounge"])
    icon = read(os.path.join(REPO, "icons", "logo-512.png"))
    if icon:
        edit["icon"] = icon
    # The purple Kit Up banner at the top of the channel list (Discord unlocks banners at Boost level 2).
    banner = read(os.path.join(REPO, "discord-bot", "banner.png"))
    if banner and "BANNER" in guild.features:
        edit["banner"] = banner
    elif banner:
        print("  · server banner needs Boost level 2; run this again once the server has it")
    try:
        await guild.edit(**edit)
    except discord.HTTPException as e:
        print(f"  ! couldn't update server settings: {e}")

    await secure(guild, roles, chans)

    # Welcome, rules and the role picker.
    m = lambda n: chans[n].mention
    welcome = K.footer("Kit Up · welcome")
    welcome_embed = discord.Embed.from_dict({
        "title": "Welcome to Kit Up 🛋️",
        "description": WELCOME.format(roles=m("🎨・pick-roles"), lounge=m("🛋️・lounge"),
                                      lfg=m("🎮・lfg-multiplayer"), ask=m("🤖・ask-kit-up")),
        "color": K.ACCENT,
        "footer": welcome,
        **({"url": K.site(), "thumbnail": {"url": K.site("icons/logo-512.png")}} if K.site() else {}),
    })
    view = None
    if K.site():
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Open Kit Up", url=K.site(), emoji="🎯"))
        view.add_item(discord.ui.Button(label="Live meta", url=K.site("#meta")))
        view.add_item(discord.ui.Button(label="Loadout maker", url=K.site("#build")))
    await post_once(chans["👋・welcome"], me, "welcome", embed=welcome_embed, view=view)

    rules_embed = discord.Embed.from_dict({
        "title": "House rules",
        "description": "\n".join(f"`{i+1}` {r}" for i, r in enumerate(RULES)) +
                       "\n\nThat's it. HQ and Overwatch keep the peace.",
        "color": K.GOLD,
        "footer": K.footer("Kit Up · rules"),
    })
    await post_once(chans["📜・house-rules"], me, "rules", embed=rules_embed)

    roles_embed = discord.Embed.from_dict({
        "title": "Pick your roles",
        "description": "Tap a button to add the role, tap again to drop it.\n\n"
                       "**Platform** · 🖥️ PC · 🎮 PlayStation · 🟩 Xbox\n"
                       "**Plays** · 🎯 Multiplayer · ☢️ DMZ · 🪂 Warzone\n"
                       "**Pings** · 📋 Patch Alerts (new patch notes) · 📈 Meta Alerts (tier changes)",
        "color": K.ACCENT,
        "footer": K.footer("Kit Up · roles"),
    })
    await post_once(chans["🎨・pick-roles"], me, "roles", embed=roles_embed, view=RoleView())

    # Webhooks for the daily feed.
    avatar = read(os.path.join(REPO, "icons", "logo-192.png"))
    print("\n=== Add these as GitHub repo secrets (Settings → Secrets and variables → Actions) ===")
    for secret, name in WEBHOOK_CHANNELS.items():
        ch = chans[name]
        hooks = await ch.webhooks()
        hook = discord.utils.get(hooks, name="Kit Up") or await ch.create_webhook(name="Kit Up", avatar=avatar)
        print(f"{secret} = {hook.url}")
    print(f"DISCORD_PATCH_ROLE_ID = {roles['Patch Alerts'].id}")
    print(f"DISCORD_META_ROLE_ID = {roles['Meta Alerts'].id}")
    print("\nKeep the webhook URLs private — anyone with one can post in that channel.")

    # Art card pinned in every text channel (skips channels that already have theirs).
    print("\nPinning the channel cards…")
    pin_cards.run(TOKEN, GUILD_ID)
    print("Done. Your Kit Up server is ready. 🛋️")


def main():
    if not TOKEN or not GUILD_ID:
        sys.exit("Set DISCORD_TOKEN and DISCORD_GUILD_ID first (see discord/README.md).")
    intents = discord.Intents.default()
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        try:
            await build(client)
        except discord.Forbidden as e:
            print(f"\nDiscord said no: {e}\nMake sure the bot was invited with Administrator "
                  "and its role sits at the top of Server Settings → Roles.")
        finally:
            await client.close()

    client.run(TOKEN, log_handler=None)


if __name__ == "__main__":
    main()
