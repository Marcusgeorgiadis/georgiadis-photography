# Georgiadis Photography

Wildlife of Central Florida: a gallery of the Finals from the Nikon archive.

The site is static (GitHub Pages) and rebuilds itself:

1. **Google Drive.** `drive-sync/PublicGallerySync.gs` runs every 30 minutes in Google Apps Script. It copies every Finals photo from the Nikon folder into `Nikon/Public Gallery` (shared as "anyone with the link"), keeps the copies in step with the originals, and writes `manifest.json` there. RAW folders are never touched.
2. **The cloud job.** A scheduled job reads the manifest and the private Workshop's library (species IDs, ratings, hidden photos, notes), adds camera data for new photos, and runs `tools/build_site.py`, which writes `data/gallery.json` and `index.html` here.
3. **The site.** `index.html` loads `core/` (the shared gallery engine) and `site.js`, which shows the public copies straight from Google Drive.

## Layout

| Path | What it is |
| --- | --- |
| `core/` | Shared design system and engine: `gallery.css`, `model.js` (species, bursts, outings, rooms, search), `app.js` (views), `viewer.js` (zoom viewer, exhibition mode) |
| `site.js`, `index.template.html` | The public site |
| `workshop/` | The private Workshop: the same engine plus sorting with Claude, ID fixes and publish controls |
| `data/` | `gallery.json` (built), field notes, outing summaries, taxonomy |
| `tools/` | `build_site.py`, `nikon_previews.py`, `nikon_enrich.py`, `dev_server.py` |
| `drive-sync/` | The Apps Script that keeps the public copies current |

## Local preview

```sh
GDRIVE_SA_KEY=... python3 tools/build_site.py build --db <database dump> --repo . --dev
GDRIVE_SA_KEY=... python3 tools/dev_server.py --site .
```

Photographs © Georgiadis Photography.
