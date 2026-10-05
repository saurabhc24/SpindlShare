# Showreel

`spindlshare-showreel.mp4`: the edited cut, 1920x1080, 30 fps, 57 seconds,
H.264 with an original soundtrack. It was cut in Clipchamp from the rendered
film (64 seconds at 60 fps), and is kept in Git LFS because the export is over
GitHub's 100 MB file limit.

A motion piece rather than a walkthrough: nine scenes on one 120 BPM clock. A
cold open on the real deck, the headline, the record changer, the links it
replaces, the three steps as sleeves, the shelf, the player, the sand, and the
back cover. Every cut, landing and word sits on a beat, because the picture and
the music read their cues from the same file, `showreel/src/score.mjs`.

## Rebuild

```bash
FFMPEG=<path to ffmpeg> node promo/showreel/render.mjs    # the film, about 20 min
node promo/showreel/render.mjs --draft                     # 30 fps, no blur, 4 min
node promo/showreel/preview.mjs <dir> 12.5 40.2            # stills at chosen times
node promo/showreel/music.mjs                              # the soundtrack alone
```

Nothing needs the app running: the stage is a local page, and it reads the shelf
from `showreel/shelf.json`, a snapshot of the showcase shelf's covers, titles,
counts and songs.

- **Frames are rendered, not recorded.** Everything on the stage is a function
  of time: the renderer asks for time t, captures it and moves on, so a slow
  frame costs minutes, never smoothness, and any moment can be rendered alone to
  check it. That is also why the stage has no CSS transitions or animations:
  they run on the browser's clock, not the film's.
- **The turntable is the product's own.** `app/_landing/turntable-3d.ts` is
  bundled unchanged; the build only exports the parts the module keeps private
  (the record, the deck, the studio lighting) so the film can place its own
  cameras. The shelf's geometry is measured off the live page.
- **The soundtrack is synthesised** in `music.mjs`, with no samples and so no
  licence to clear: FM electric piano, a supersaw pad, plucked arpeggios, drums,
  vinyl crackle, a scratch and a tape stop. It also writes the cue times and a
  spectrum per frame, which the EQ bars and pulses on screen read, so they move
  with the actual sound. The scratch and the records turning on screen follow
  one shared position curve.
- **Motion blur** is three sub-frames across half of each frame, a 180° shutter,
  averaged by ffmpeg.
- **The render never touches the edited cut.** It writes a master (CRF 14) and a
  web copy to `showreel/dist/`, which git ignores; re-cutting the film from
  them is a separate, deliberate step.

# Launch assets

`peerlist/`: what Peerlist's product listing asks for. `logo.png` (500x500) is
a record with the display face's S on a ruby label; the wordmark face's S reads
as an 8 on its own. The four covers (1200x630) are lossless stills from the
showreel stage, cropped from 16:9. `demo.mp4` is the edited showreel brought
under the 100 MB upload limit, and is not committed:

```bash
ffmpeg -i promo/spindlshare-showreel.mp4 -c:v libx264 -preset slow -b:v 10500k -pass 1 -an -f mp4 NUL
ffmpeg -i promo/spindlshare-showreel.mp4 -c:v libx264 -preset slow -b:v 10500k -maxrate 16M \
  -bufsize 21M -pass 2 -c:a copy -movflags +faststart promo/peerlist/demo.mp4
```

# Feature video

`spindlshare-feature.mp4`: 1920x1080, 30 fps, about 45 seconds, silent, H.264.

A logo open, six features, and an end card: one link for every playlist,
pasting a link, the stacked shelf, the arc, tap a song to play it, and curating
the dashboard. The logo is the product's own wordmark face and the headlines
the homepage's display face, loaded from `app/_fonts/`.

## Rebuild

```bash
npm run dev
npx @puppeteer/browsers install chrome-headless-shell@stable --path ./.browsers
BROWSER=<path to chrome-headless-shell> FFMPEG=<path to ffmpeg> \
  node promo/record.mjs http://localhost:3000
```

`stage.html` is the set. `record.mjs` plays it in real time and films it with
the screencast, so the motion in the file runs at the speed it ran on screen.

Use chrome-headless-shell, not a full browser. The screencast films the window,
and headless Edge opens its own panels in the window partway through a run,
which cropped the film. The recorder refuses any frame that is not exactly
1920x1080 and fails the run rather than let one through.

The shelf and player shots are the shipped `Deck` and `Arc` in `/embed/*`,
driven through DevTools. The recorder checks that the shelf moved, the arc
moved, the player opened and a song was playing, and exits non-zero if any did
not. It blocks `/api/visit`, so filming does not count as a visit.
