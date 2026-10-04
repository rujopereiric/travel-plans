# Travel Plans (all-in-one app)

One installable app that holds every trip planner: https://rujopereiric.github.io/travel-plans/trips/

Chrome on Android only allows **one installed app per site address**, and everything here lives on
`rujopereiric.github.io`. So the planners are bundled into one app instead of being installed separately.

- **Home screen** (`index.html`): a card per trip with your dates and how many free days are planned. Tap one to open it.
  The list comes from `trips.json`.
- **Each trip** (`iceland/`, `egypt/`, `portugal/`, `portugal-kids/`) is the full planner, with a **← Trips** link back to the home screen.
- **Help:** the home screen has a short *How it works*, and every trip has a **? Help** button with the full guide.
- **Install once:** Chrome menu ⋮ → Add to home screen. Long-press the icon for **Iceland**, **Egypt**, **Portugal** and **Portugal with kids** shortcuts.

## How the copies are made

The standalone planners (`../iceland-planner/`, `../egypt/`, `../portugal/`, `../portugal-kids/`) stay the source of truth and are never modified.
`tools/build.py` copies each one into `trips/<id>/` and patches the copy:

- **Your plan is saved separately:** keys start with `tp-`, so the new app can't change your existing plans.
  The first time you open a trip here, it offers to copy your plan from the standalone app. The original stays as it is.
- **Shared re-downloadable data:** photos, road routes, map places and the exchange rate keep their original keys.
  So they're shared with the standalone app instead of filling the ~5 MB browser storage twice.
- **Separate offline caches:** these are prefixed `tp-<id>-`, so neither app's service worker deletes the other's files.
  Map tiles are cached as proper CORS responses; opaque ones were being counted as several MB each.
- **Egypt and Portugal map data:** they read their OpenStreetMap files from `../../egypt/osm/` and `../../portugal/osm/`, which daily GitHub Actions keep up to date.
- **Shareable sample data:** the copies contain no personal dates, plans or bookings (the `generic` settings in `trips.json`).
  A new user gets a sample trip that starts about a month after they first open it, with arrival and departure days marked.
  It has one empty plan and a generic bookings checklist. Places, photos, drive times, settings and safety info are all kept.
  Your own plan only appears if you accept the one-time "copy from the standalone app" offer.
- **Shared manifest:** every page links to `trips/manifest.webmanifest`, so the whole thing is one app.

After changing a standalone planner, refresh the copies with:

```
python3 trips/tools/build.py
```

The script checks every patch. If a source file has changed so a patch no longer applies, it stops with an error instead of producing a broken copy.

## Adding a destination

1. Build the planner as its own folder, as Iceland and Egypt are.
2. Add an entry to `trips.json`: `id`, `name`, `source` folder, `flag`, `color`, `blurb`, `copyKeys` (its plan and UI storage keys mapped to new `tp-` keys), `uiKey`, and `swReplace` (its cache-name prefix renamed to `tp-<id>-`).
3. Add a shortcut for it to `manifest.webmanifest` (with a `shortcut-<id>.png` icon).
4. Run `python3 trips/tools/build.py`.

Longer term, the planners could share one engine, with each destination as a data file plus settings, so a fix reaches every trip at once.
For now they're separate copies, which keeps the standalone apps completely untouched.
