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
