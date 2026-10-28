# Kit Up Discord

A chill hangout for Kit Up, themed in the app's purple and gold, wired to the app's live data.

- **`setup_server.py`** builds the whole server once: roles, channels, permissions, welcome and rules posts, the role picker, the Kit Up icon and the feed webhooks.
- **`announce.py`** + **`.github/workflows/discord-feed.yml`** post the daily meta, new patch notes, news and store to the feed channels every time `data/` changes on `main`. No server needed; it runs on GitHub.
- **`netlify/functions/discord.mjs`** answers the slash commands (`/meta`, `/gun`, `/build`, `/range`, `/patch`, `/news`, `/store`) and the role buttons from your Netlify site, so no always-on bot is needed. `register_commands.py` registers the commands; the Developer Portal's **Interactions Endpoint URL** points at `https://<your site>/api/discord`. For the role buttons, add `DISCORD_TOKEN` in Netlify → Site configuration → Environment variables.
- **`pin_cards.py`** posts a Kit Up art card in every text channel and pins it (the cards are in `cards/`). Run it from GitHub: **Actions → Discord cards → Run workflow**.
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

## Pinned channel cards

Every text channel gets its own art card, pinned so it's always one tap away. `setup_server.py` pins them as part of the build, or you can post them on their own from your phone:

1. On GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**. Add `DISCORD_TOKEN` (the bot token, the same one that's on Netlify) and `DISCORD_GUILD_ID` (your server ID).
2. **Actions → Discord cards → Run workflow.**

It skips channels that already have their card. To swap in new images after editing a card in `cards/`, run it with **Replace cards that are already pinned** ticked.

## Squad finder (/link and /lfg)

Players on Xbox, PlayStation and PC can find each other for DMZ, Warzone and every Multiplayer mode.

- **`/link platform activision [gamertag]`** saves a player's Activision ID once (and gives them the matching platform role). `/unlink` deletes it, `/profile [user]` shows it.
- **`/lfg mode [slots] [note]`** posts a squad request with **Join**, **Leave** and **Close** buttons. use `/lfg multiplayer`, `/lfg dmz` or `/lfg warzone`. Multiplayer has a fixed dropdown of the in-game modes (Hardpoint, Gunfight, Search & Destroy and the rest, with unreleased ones hidden), DMZ has Story Missions, Dynamic Operations and Free Roam, and Warzone takes a typed mode. The dropdowns come from the app's data files when you run `register_commands.py`, so rerun the Discord commands workflow when new modes launch. Squads fill to 3 (DMZ), 4 (Warzone), 2 (Gunfight) or 6 (other Multiplayer modes), and `slots` can override it; anyone with a linked ID can join, whatever their platform. The host or a mod can close it.
- IDs are stored in a private **#kitup-data** channel the bot creates the first time someone runs `/link`. Only HQ can see it. Don't edit it by hand.
- Needs `DISCORD_TOKEN` in Netlify (the same token the role buttons use).

After deploying, register the new commands once: **Actions → Discord commands → Run workflow** (or `python discord-bot/register_commands.py`). To check the logic offline: `node discord-bot/test_squad_finder.mjs`.

## Finishing touches in Discord

**Server banner** (needs Boost level 2): `setup_server.py` uploads `discord-bot/banner.png`, the purple Kit Up banner from the promo, as soon as the server has the perk. Run the script again after boosting.

These can't be set by a bot, so do them by hand if you like:
- **Community** (Server Settings → Enable Community) unlocks onboarding and a welcome screen. Point its rules channel at #house-rules.
- Make an invite that never expires from #welcome and put it wherever you share Kit Up.

## Try the feed without posting

```bash
python discord-bot/announce.py --before HEAD~1 --after HEAD --dry-run
```
