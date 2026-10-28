# Kit Up Discord

A chill hangout for Kit Up, themed in the app's purple and gold, wired to the app's live data.

- **`setup_server.py`** builds the whole server once: roles, channels, permissions, welcome and rules posts, the role picker, the Kit Up icon and the feed webhooks.
- **`announce.py`** + **`.github/workflows/discord-feed.yml`** post the daily meta, new patch notes, news and store to the feed channels every time `data/` changes on `main`. No server needed; it runs on GitHub.
- **`netlify/functions/discord.mjs`** answers the slash commands (`/meta`, `/gun`, `/build`, `/range`, `/patch`, `/news`, `/store`) and the role buttons from your Netlify site, so no always-on bot is needed. `register_commands.py` registers the commands; the Developer Portal's **Interactions Endpoint URL** points at `https://<your site>/api/discord`. For the role buttons, add `DISCORD_TOKEN` in Netlify → Site configuration → Environment variables.
- **`bot.py`** is an alternative always-on bot with the same commands, if you'd ever rather host one.

## The server

| Category | Channels |
| --- | --- |
| 👋 START HERE (read-only) | welcome · house-rules · pick-roles |
| 📡 KIT UP FEED (read-only, auto) | meta-updates · patch-notes · news · store |
| 🛋️ THE LOUNGE | lounge · clips · memes · now-playing |
| 🔧 LOADOUTS | build-share · meta-talk · ask-kit-up |
| 🎮 SQUAD UP | lfg-multiplayer · lfg-dmz · 🔊 The Couch · Squad 1 · Squad 2 · DMZ Infil · AFK |

Roles: **HQ** (admins, gold), **Overwatch** (mods, light purple), plus self-assign PC / PlayStation / Xbox, Multiplayer / DMZ / Warzone, and **Patch Alerts** / **Meta Alerts** pings.

Colors come straight from `index.html`: accent `#9B7BFF`, gold `#F2B726`, buff `#62BE7C`, nerf `#E8645A`, adjust `#7AA9D6`.

## Set it up (about 10 minutes)

**1. Make the server.** In Discord: **+ → Create My Own → For me and my friends**, name it **KitUp N Lounge**. Turn on **Developer Mode** (User Settings → Advanced), then right-click the server → **Copy Server ID**.

**2. Make the bot.** Go to <https://discord.com/developers/applications> → **New Application** → name it **Kit Up**, and upload `icons/logo-512.png` as its icon.
- **Bot** tab → **Reset Token** → copy it. Treat it like a password; never commit it.
- **OAuth2 → URL Generator**: tick `bot` and `applications.commands`, then **Administrator** under bot permissions. Open the link and add the bot to your Kit Up server.
- Server Settings → **Roles**: drag the **Kit Up** bot role to the top so it can hand out roles.

**3. Build the server.** From the repo root:

```bash
pip install -r discord-bot/requirements.txt
export DISCORD_TOKEN="your bot token"
export DISCORD_GUILD_ID="your server id"
export KITUP_URL="https://your-kit-up-site"     # your Netlify address
python discord-bot/setup_server.py
```

It prints four webhook URLs and two role IDs at the end. Running it again is safe; it reuses what's there.

**4. Turn on the daily feed.** On GitHub: repo **Settings → Secrets and variables → Actions**.
- **Secrets**: `DISCORD_WEBHOOK_META`, `DISCORD_WEBHOOK_PATCHES`, `DISCORD_WEBHOOK_NEWS`, `DISCORD_WEBHOOK_STORE` (the URLs from step 3).
- **Variables**: `KITUP_URL`, and optionally `DISCORD_PATCH_ROLE_ID` / `DISCORD_META_ROLE_ID` so new patches and tier changes ping those roles.

From then on, every push that changes `data/` (like the daily data update) posts to Discord. To test right away: **Actions → Discord feed → Run workflow**.

**5. Run the bot.** The slash commands and role buttons only work while `bot.py` is running:

```bash
python discord-bot/bot.py      # same DISCORD_TOKEN, DISCORD_GUILD_ID, KITUP_URL as above
```

Run it on anything that stays on: a spare PC or Raspberry Pi, a small VPS, or any Python host that runs a long-lived worker (start command `python discord-bot/bot.py`, with the three environment variables set). The bot reads the live site, so it picks up each daily update on its own within 10 minutes.

## Finishing touches in Discord

**Server banner** (needs Boost level 2): `setup_server.py` uploads `discord-bot/banner.png`, the purple Kit Up banner from the promo, as soon as the server has the perk. Run the script again after boosting.

These can't be set by a bot, so do them by hand if you like:
- **Community** (Server Settings → Enable Community) unlocks onboarding and a welcome screen. Point its rules channel at #house-rules.
- Make an invite that never expires from #welcome and put it wherever you share Kit Up.

## Try the feed without posting

```bash
python discord-bot/announce.py --before HEAD~1 --after HEAD --dry-run
```
