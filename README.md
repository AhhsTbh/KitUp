# Kit Up social posts

This branch is separate from the website (`main`) and never deploys to Netlify.

- `kitup_card.py` renders a loadout card PNG and its floating MP4 using the app's own card code from a `main` checkout. Run it with `--help` notes at the top of the file.
- `videos/` holds the floating videos that Metricool pulls for TikTok drafts.
- `posted.json` lists which guns have already been posted or drafted, so posts don't repeat.
