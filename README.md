# Kit Up

Kit Up is a Call of Duty: Modern Warfare 4 companion app by KitUp.GG.

It covers all 33 weapons with stats, Apex attachments and every attachment, a loadout maker with share codes and PNG cards, the early meta tier list and builds, maps and modes, the full camo grind tracker, patch notes and news.

It's a static site: plain HTML, CSS and JavaScript with no build step. You can install it to your phone's home screen.

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
| `data/tiers.json` | Early meta tier list |
| `data/maps.json` | Maps and modes |
| `data/patches.json` | Patch notes, newest first |
| `data/news.json` | Home screen news |
| `data/shop.json` | Today's store items |
| `images/`, `icons/` | Weapon, gear, Operator and camo images, plus the Kit Up logo |

Most updates are edits to one of the JSON files in `data/`. The app picks them up on the next load.

## Credits

Weapon, gear, Operator and camo images © Activision, from official Modern Warfare 4 posts. Attachment and camo challenge data comes from codmunity.gg. Kit Up is a fan project and isn't affiliated with Activision.
