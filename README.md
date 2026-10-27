# Georgiadis Photography

Wildlife of Central Florida: a gallery of the Finals from the Nikon archive.

The site is static (GitHub Pages) and rebuilds itself:

1. **Google Drive.** `drive-sync/PublicGallerySync.gs` runs every 30 minutes in Google Apps Script. It copies every Finals photo from the Nikon folder into `Nikon/Public Gallery` (shared as "anyone with the link"), keeps the copies in step with the originals, and writes `manifest.json` there. RAW folders are never touched.
2. **The cloud job.** A scheduled job reads the manifest and the private Workshop's library (species IDs, ratings, hidden photos, notes), adds camera data for new photos, and runs `tools/build_site.py`, which writes `data/gallery.json`, `index.html`, the link-preview pages and the calls of any new species here.
3. **The site.** `index.html` loads `core/` (the shared gallery engine) and `site.js`, which shows the public copies straight from Google Drive.

## What's in the gallery

- **Home**: a shutter opening on a first visit, then the strongest frames, each one moving with its depth (or playing its burst), with the headline set in the corner the bird leaves empty. Below: the latest outing as a dispatch from the field, the archive at a glance, "At this hour" (what was photographed around this time of day in Florida), highlights, the ways in, who's around now (a year wheel and the species likely this time of year), the species of the day, rooms, outings and what was photographed on this day. Returning visitors also see what's new since their last visit, their favourites and where they left off.
- **Exhibitions** (`#/rooms`): themed rooms (and any curated collections) hung like a gallery wall, with a label beside every print, then the rest of the room as a grid. Each room, outing, species page or search can be played full screen as an exhibition: labels, speed, the birds' calls, keyboard and swipe.
- **Gallery, Species, Outings, Journal**: search with suggestions as you type, density and "new since your last visit"; the field guide with calls, light and "seen with"; each outing's day placed by the minute against that day's light, with "Hear the day"; charts, records and the tree of life.
- **Favourites**: the heart in the viewer (or L) hangs a photograph in the visitor's own room. Favourites, "new since last visit" and the daily score stay on the visitor's device.
- **Universe** (`#/universe`): every photograph as a tile on one canvas, rearranged into a colour wheel, a skyline of outings, a 24-hour dial or clusters by family. Zoom far into a tile to open it.
- **Viewfinder and loupe**: with a mouse, focus brackets lock onto the subject of the photograph under the pointer. Hold Shift (or long-press on a phone) for a loupe that loads the original as you magnify.
- **Cabinet of specimens**: the species guide as a cabinet, one drawer per family, with museum labels.
- **Tree of life** (Journal): the life list as a radial tree that grows in the order species were first photographed.
- **Bird calls**: each species' call on its page and in the viewer, off until the visitor turns sound on. Recordings come from iNaturalist under Creative Commons licences and are credited beside every player.
- **Name that bird** (`#/quiz`): ten close crops, four names each, at four levels plus "Name that call"; today's challenge is the same ten for everyone and keeps a streak.
- **The live sky**: the header is the sky over Central Florida right now (sun, twilight, night) with the moon in its true phase; click it for sunrise, sunset and what's next. Every page takes on the colours of the photograph in front of it.
- **Living photographs**: photographs arrive like a lens finding focus, outing pages develop like prints in a tray, backlit frames carry a light leak, and bursts play at the speed they were shot (rest the pointer on a burst in the gallery, or press V in the viewer). Photographs of water ripple where they're touched, and the hero and viewer photographs move in 2.5D from depth maps (below).
- **How it was shot** (viewer, H): the aperture closing to its f-number, the shutter's slit and how far a bird flying past would have moved, the field of view, the grain of the ISO, and the sky that moment: where the sun and moon were.
- **Species pages**: a watercolour wash in the bird's own colours, the name sings with its call, "In every light" (the species from first light to dusk) and its natural-history plate.
- **Plates** (`#/plates`): one plate per family in the manner of an old natural history, numbered, with oval vignettes and a key; printable.
- **Night sky** (`#/sky`): every species a star, its brightness the number of photographs, families as constellations.
- **A day in the marsh** (`#/day`): sixty seconds from 4 am to night, each bird calling from its side of the marsh at the hour it's most often photographed.
- **Soundscape** (header, S): the place each photograph was made (water, pines, surf, open ground, crickets after dark), with the birds calling as you pass them. Off until the visitor turns it on.
- **Exhibition rooms**: the camera follows the bird and focus pulls between slides in the player; B turns the lights down in a room and each print gets its own lamp.
- **Journal as a field notebook**: the year as a colour barcode, then month spreads with handwritten lines, taped prints and new species, inked as they turn into view. Every outing can also be read as a story (`#/story/<outing>`): the sky moving with the clock, each bird arriving in turn, with sound.
- **Hover previews**: with a mouse, rest on a link to a species, outing, room or plate for a card with its photograph.
- **Link previews**: shared links (`p/<photo>`, `s/<species>`, `o/<outing>`, `r/<room>`) are small pages whose previews show that exact photograph, then open it in the gallery.

## Layout

| Path | What it is |
| --- | --- |
| `core/` | Shared engine: `gallery.css`, `extras.css` and `pages.css`, `model.js` (species, bursts, outings, rooms, search), `app.js` (shell and views), `viewer.js` (zoom viewer), `visitor.js` (favourites, new since last visit), `home.js`, `rooms.js` (exhibitions and the full-screen player), `universe.js`, `lens.js` (viewfinder, loupe), `cabinet.js`, `treeoflife.js`, `calls.js`, `quiz.js`; `effects.css` and `atlas.css`, `sky.js` (sun, moon, the live sky), `tint.js` (colours from the photograph), `fx.js` (arrival, darkroom, light leaks, bursts, depth and water), `soundscape.js`, `intro.js`, `shot.js` (how it was shot, the sky that moment), `peek.js` (hover previews), `marsh.js`, `nightsky.js`, `plates.js`, `notebook.js` (barcode, field notebook), `story.js` |
| `site.js`, `index.template.html` | The public site |
| `p/`, `s/`, `o/`, `r/` | Link-preview pages (built) |
| `depth/` | A small depth map for each photograph (built by `depth_maps.py`) |
| `audio/calls/` | Call clips and their sonograms (built by `fetch_calls.py`) |
| `workshop/` | The private Workshop: the same engine plus sorting with Claude, ID fixes and publish controls |
| `data/` | `gallery.json` (built), `calls.json` (recording credits), field notes, outing summaries, taxonomy |
| `tools/` | `build_site.py`, `og_pages.js`, `fetch_calls.py`, `depth_maps.py`, `nikon_previews.py`, `nikon_enrich.py`, `dev_server.py` |
| `drive-sync/` | The Apps Script that keeps the public copies current |

## Bird calls

`tools/fetch_calls.py --repo .` looks up research-grade, openly licensed recordings for each species on iNaturalist, keeps the clearest of the top candidates (judged in the frequency band where the species calls), and saves a trimmed, filtered, loudness-matched 10-second clip with a sonogram and its credit. Species with no usable recording are remembered so they aren't retried; `--retry-none` tries them again and `--sonograms` redraws the sonograms. The build runs it for new species automatically when ffmpeg is installed.

## Depth maps

`tools/depth_maps.py --repo .` estimates depth for each public photograph with Depth Anything V2 Small (Apache-2.0, run on the CPU with onnxruntime) and saves a 192-pixel greyscale map in `depth/`, listed in `depth/index.json`. The site uses them for the 2.5D movement and to keep ripples off the subject. Existing maps are kept, maps of photographs no longer public are removed, and `--limit` caps how many are made in one run (the build spends at most 90 seconds a run on them and makes the rest next time, installing onnxruntime if it is missing; `--no-depth` skips it). The model (about 100 MB) is downloaded once to `~/.cache/georgiadis/` or `$GP_MODEL_CACHE`. Without a map a photograph simply doesn't move.

## Local preview

```sh
GDRIVE_SA_KEY=... python3 tools/build_site.py build --db <database dump> --repo . --dev
GDRIVE_SA_KEY=... python3 tools/dev_server.py --site .
```

Photographs © Georgiadis Photography. Recordings © their recordists, under the licences named beside each one.
