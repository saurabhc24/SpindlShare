# Promo video

`spindlshare-promo.mp4` — 1920x1080, 36s, silent, H.264.

Rebuild it:

```bash
npm run dev                     # the recorder films the real app
cd promo && node record.mjs http://localhost:3000
```

`stage.html` is the set: captions, the phone frame, the title and end cards.
`record.mjs` drives it shot by shot, captures a frame at a fixed cadence, and
muxes with ffmpeg. Frames are pulled one at a time rather than streamed, so the
same run gives the same video however slow the machine is.

Shots 5 and 6 iframe `/embed/stacked` and `/embed/arc`, which render the
shipped `Deck` and `Arc` against real playlists. The motion in frame is the
product's own, not a re-creation.

Needs `ffmpeg-static` on the path the script expects; install it in the working
directory if it is missing.
