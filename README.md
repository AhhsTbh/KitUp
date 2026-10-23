# Kit Up

Kit Up is a Call of Duty: Modern Warfare 4 companion app by KitUp.GG.

It covers all 33 weapons with live TTK, handling and recoil numbers, Apex attachments and every attachment, the live meta tier list with pick rates, daily meta movers and top builds, a range finder that ranks guns for the distance you fight at, a loadout maker with live build stats, share codes and PNG cards, a DMZ guide, Prestige and season rewards, maps and modes, the full camo grind tracker, patch notes and news.

It's a static site: plain HTML, CSS and JavaScript with no build step. You can install it to your phone's home screen, and once it has loaded it keeps working offline (`sw.js`).

## Deploy on Netlify

1. In Netlify, choose **Add new site → Import an existing project → GitHub**.
2. Pick the `KitUp` repo.
3. Leave the build command empty. Set the publish directory to `.` (netlify.toml already does this).
4. Click **Deploy**. Every push to `main` redeploys the site automatically.

## Where things live

| Path | What it holds |
| --- | --- |
| `index.html` | The whole app (layout, styles, logic) |
| `data/game.json` | Weapons, perks, equipment, killstreaks, Operators, camos and challenges |
| `data/attachments.json` | Every attachment per gun, with unlock level and stat changes |
| `data/meta.json` | Meta builds (load straight into the loadout maker) |
| `data/tiers.json` | Live meta tier list and pick rates |
| `data/history.json` | One pick-rate snapshot per day (powers Meta movers) |
| `data/dmz.json` | DMZ guide: infil, FOB, threats, Operators, DMZ builds |
| `data/progress.json` | Prestige rewards, roadmap and season info |
| `data/maps.json` | Maps and modes |
| `data/patches.json` | Patch notes, newest first |
| `data/news.json` | Home screen news |
| `data/shop.json` | Today's store items |
| `images/`, `icons/` | Weapon, gear, Operator and camo images, plus the Kit Up logo |
| `sw.js` | Offline support |
| `tools/` | Scripts that refresh the live meta (not published to the site) |

Most updates are edits to one of the JSON files in `data/`. The app picks them up on the next load.

## Refreshing the live meta

Run `bash tools/refresh_meta.sh` from the repo root. It pulls the latest numbers from codmunity.gg and rewrites the live stats in `data/game.json`, plus `data/tiers.json`, `data/meta.json` and the builds in `data/dmz.json`, and adds today's snapshot to `data/history.json`. Check `git diff --stat data/` before you commit.

## Credits

Weapon, gear, Operator and camo images © Activision, from official Modern Warfare 4 posts. Attachment, camo challenge, live stat and meta data comes from codmunity.gg. DMZ and Prestige details come from Activision's official guides. Kit Up is a fan project and isn't affiliated with Activision.
