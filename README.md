# Georgiadis Photography

Wildlife of Central Florida: a gallery of the Finals from the Nikon archive.

The site is static (GitHub Pages) and rebuilds itself:

1. **Google Drive.** `drive-sync/PublicGallerySync.gs` runs every 30 minutes in Google Apps Script. It copies every Finals photo from the Nikon folder into `Nikon/Public Gallery` (shared as "anyone with the link"), keeps the copies in step with the originals, and writes `manifest.json` there. RAW folders are never touched.
2. **The cloud job.** A scheduled job reads the manifest and the private Workshop's library (species IDs, ratings, hidden photos, notes), adds camera data for new photos, and runs `tools/build_site.py`, which writes `data/gallery.json`, `index.html`, the link-preview pages and the calls of any new species here.
3. **The site.** `index.html` loads `core/` (the shared gallery engine) and `site.js`, which shows the public copies straight from Google Drive.

## What's in the gallery

- **Home**: an opening sequence of the strongest frames, the archive at a glance, highlights, the ways in (Universe, cabinet, tree of life, today's challenge, a call to hear), the species of the day, rooms to walk through, the latest outings and what was photographed on this day. Returning visitors also see what's new since their last visit, their favourites and where they left off.
- **Exhibitions** (`#/rooms`): themed rooms (and any curated collections) hung like a gallery wall, with a label beside every print, then the rest of the room as a grid. Each room, outing, species page or search can be played full screen as an exhibition: labels, speed, the birds' calls, keyboard and swipe.
- **Gallery, Species, Outings, Journal**: search with suggestions as you type, density and "new since your last visit"; the field guide with calls, light and "seen with"; each outing's day placed by the minute against that day's light, with "Hear the day"; charts, records and the tree of life.
- **Favourites**: the heart in the viewer (or L) hangs a photograph in the visitor's own room. Favourites, "new since last visit" and the daily score stay on the visitor's device.
- **Universe** (`#/universe`): every photograph as a tile on one canvas, rearranged into a colour wheel, a skyline of outings, a 24-hour dial or clusters by family. Zoom far into a tile to open it.
- **Viewfinder and loupe**: with a mouse, focus brackets lock onto the subject of the photograph under the pointer. Hold Shift (or long-press on a phone) for a loupe that loads the original as you magnify.
- **Cabinet of specimens**: the species guide as a cabinet, one drawer per family, with museum labels.
- **Tree of life** (Journal): the life list as a radial tree that grows in the order species were first photographed.
- **Bird calls**: each species' call on its page and in the viewer, off until the visitor turns sound on. Recordings come from iNaturalist under Creative Commons licences and are credited beside every player.
- **Name that bird** (`#/quiz`): ten close crops, four names each, at four levels plus "Name that call"; today's challenge is the same ten for everyone and keeps a streak.
- **Link previews**: shared links (`p/<photo>`, `s/<species>`, `o/<outing>`, `r/<room>`) are small pages whose previews show that exact photograph, then open it in the gallery.

## Layout

| Path | What it is |
| --- | --- |
| `core/` | Shared engine: `gallery.css`, `extras.css` and `pages.css`, `model.js` (species, bursts, outings, rooms, search), `app.js` (shell and views), `viewer.js` (zoom viewer), `visitor.js` (favourites, new since last visit), `home.js`, `rooms.js` (exhibitions and the full-screen player), `universe.js`, `lens.js` (viewfinder, loupe), `cabinet.js`, `treeoflife.js`, `calls.js`, `quiz.js` |
| `site.js`, `index.template.html` | The public site |
| `p/`, `s/`, `o/`, `r/` | Link-preview pages (built) |
| `audio/calls/` | Call clips and their sonograms (built by `fetch_calls.py`) |
| `workshop/` | The private Workshop: the same engine plus sorting with Claude, ID fixes and publish controls |
| `data/` | `gallery.json` (built), `calls.json` (recording credits), field notes, outing summaries, taxonomy |
| `tools/` | `build_site.py`, `og_pages.js`, `fetch_calls.py`, `nikon_previews.py`, `nikon_enrich.py`, `dev_server.py` |
| `drive-sync/` | The Apps Script that keeps the public copies current |

## Bird calls

`tools/fetch_calls.py --repo .` looks up research-grade, openly licensed recordings for each species on iNaturalist, keeps the clearest of the top candidates (judged in the frequency band where the species calls), and saves a trimmed, filtered, loudness-matched 10-second clip with a sonogram and its credit. Species with no usable recording are remembered so they aren't retried; `--retry-none` tries them again and `--sonograms` redraws the sonograms. The build runs it for new species automatically when ffmpeg is installed.

## Local preview

```sh
GDRIVE_SA_KEY=... python3 tools/build_site.py build --db <database dump> --repo . --dev
GDRIVE_SA_KEY=... python3 tools/dev_server.py --site .
```

Photographs © Georgiadis Photography. Recordings © their recordists, under the licences named beside each one.
