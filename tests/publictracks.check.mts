import "dotenv/config";

// Exercises lib/playlist-tracks against a stubbed embed page: the shape it
// expects, and every way that shape can let it down.
//   npx tsx --conditions=react-server tests/publictracks.check.mts
//
// Spotify's embed blob is an internal structure with no compatibility promise,
// so what matters most here is that a change costs the song list and nothing
// more. No network: the fetch below is stubbed.

type FetchArgs = Parameters<typeof fetch>;

let body: string | null = null;
let ytBody: string | null = null;
let status = 200;
const requested: string[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url.includes("open.spotify.com/embed")) {
    requested.push(url);
    if (body === null) throw new Error("network down");
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/html" },
    });
  }
  if (url.startsWith("https://www.youtube.com/playlist?list=")) {
    requested.push(url);
    if (ytBody === null) throw new Error("network down");
    return new Response(ytBody, { status: 200, headers: { "Content-Type": "text/html" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { fetchPublicTracks } = await import("../lib/playlist-tracks");
const { parsePlaylistLink } = await import("../lib/playlist-link");

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const LINK = parsePlaylistLink(
  "https://open.spotify.com/playlist/4X9STQs4rZQjXHLlhjVaNY"
)!;
const YT = parsePlaylistLink(
  "https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"
)!;

function page(trackList: unknown): string {
  const data = {
    props: { pageProps: { state: { data: { entity: { trackList } } } } },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    data
  )}</script></body></html>`;
}

const song = (
  title: string,
  subtitle: string,
  duration: number,
  extra: Record<string, unknown> = {}
) => ({ title, subtitle, duration, entityType: "track", ...extra });

console.log("\nThe happy path");
status = 200;
body = page([
  // Spotify joins artists with a non-breaking space.
  song("Ajab Si", "KK, Vishal-Shekhar", 241668),
  song("Main Hoon Na", "Sonu Nigam, Shreya Ghoshal", 361066),
]);
requested.length = 0;
let tracks = await fetchPublicTracks(LINK);
check("returns the songs in order", tracks.length === 2 && tracks[0].title === "Ajab Si",
  JSON.stringify(tracks.map((t) => t.title)));
check("numbers them from zero", tracks[0].position === 0 && tracks[1].position === 1);
check("keeps durations", tracks[0].durationMs === 241668, String(tracks[0].durationMs));
check(
  "normalises the non-breaking space between artists",
  tracks[0].artist === "KK, Vishal-Shekhar",
  JSON.stringify(tracks[0].artist)
);
check(
  "asks the embed page, not oEmbed",
  requested[0]?.includes("/embed/playlist/4X9STQs4rZQjXHLlhjVaNY") === true,
  requested[0]
);

console.log("\nEntries that are not songs");
body = page([
  song("Real Song", "Someone", 200000),
  // A podcast episode rides the same list.
  song("An Episode", "A Show", 1000, { entityType: "episode" }),
  { title: "", subtitle: "x", duration: 100, entityType: "track" },
  { subtitle: "no title at all", duration: 100, entityType: "track" },
  song("Another", "", 210000),
]);
tracks = await fetchPublicTracks(LINK);
check("skips episodes and nameless entries", tracks.length === 2,
  JSON.stringify(tracks.map((t) => t.title)));
check("positions stay contiguous after the skips",
  tracks[0].position === 0 && tracks[1].position === 1,
  JSON.stringify(tracks.map((t) => t.position)));
check("an artistless song stores null, not an empty string",
  tracks[1].artist === null, JSON.stringify(tracks[1].artist));

console.log("\nA long playlist is capped");
body = page(Array.from({ length: 400 }, (_, i) => song(`Song ${i}`, "A", 1000)));
tracks = await fetchPublicTracks(LINK);
check("stops at the storage cap", tracks.length === 200, String(tracks.length));
check("and the last one is still numbered correctly",
  tracks[199].position === 199, String(tracks[199].position));

console.log("\nWhen the page lets us down");
// The whole point: a shape change costs the songs, never the caller.
body = page("not an array at all");
check("a trackList that is not a list yields nothing",
  (await fetchPublicTracks(LINK)).length === 0);

body = `<html><body><script id="__NEXT_DATA__">{ this is not json }</script></body></html>`;
check("unparseable JSON yields nothing", (await fetchPublicTracks(LINK)).length === 0);

body = "<html><body>no data block here</body></html>";
check("a page with no data block yields nothing",
  (await fetchPublicTracks(LINK)).length === 0);

body = JSON.stringify({ props: { pageProps: { state: {} } } });
check("a renamed path yields nothing rather than throwing",
  (await fetchPublicTracks(LINK)).length === 0);

status = 404;
body = page([song("Nope", "A", 1)]);
check("a 404 yields nothing", (await fetchPublicTracks(LINK)).length === 0);

status = 200;
body = null;
check("a network failure yields nothing", (await fetchPublicTracks(LINK)).length === 0);

console.log("\nWhat it refuses to ask for");
body = page([song("Nope", "A", 1)]);
requested.length = 0;
requested.length = 0;
const bad = { ...LINK, externalId: "not a real id'; drop--" };
check("a malformed id never reaches the network",
  (await fetchPublicTracks(bad)).length === 0 && requested.length === 0,
  JSON.stringify(requested));

// The list is found by searching, so a nesting change still works.
console.log("\nIt finds the list even if the nesting moves");
body = `<html><script id="__NEXT_DATA__">${JSON.stringify({
  a: { b: { c: { somethingElse: 1, trackList: [song("Moved", "A", 5000)] } } },
})}</script></html>`;
tracks = await fetchPublicTracks(LINK);
check("a deeper path is still found", tracks.length === 1 && tracks[0].title === "Moved",
  JSON.stringify(tracks.map((t) => t.title)));

// YouTube's playlist page, in both layouts it serves: lockups now, renderers before.
console.log("\nYouTube playlists");
const lockup = (id: string, title: string, channel: string, clock: string) => ({
  lockupViewModel: {
    contentId: id,
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: clock } }] } }] } },
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: channel } }] }, { metadataParts: [{ text: { content: "40M views" } }] }] } },
    } },
  },
});
const ytPage = (contents: unknown, extra: object = {}) =>
  `<html><script>var ytInitialData = ${JSON.stringify({ contents, ...extra })};</script></html>`;

ytBody = ytPage({ list: [
  lockup("MbWpPuuU1Vc", "Bole Chudiyan", "Jatin Lalit - Topic", "6:49"),
  lockup("C0S0PMpNybM", "Tum Mile", "Pritam", "1:02:05"),
  lockup("tYHrT837H0M", "[Private video]", "", ""),
  lockup("bad id!", "Crafted", "X", "1:00"),
  { lockupViewModel: { contentId: "PLabcdefghijk", contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" } },
] }, { sidebar: [lockup("vtfS-7VJDQM", "Sidebar song", "Nobody", "3:00")] });
requested.length = 0;
tracks = await fetchPublicTracks(YT);
check("reads the songs from the page body", tracks.length === 2, JSON.stringify(tracks.map((t) => t.title)));
check("asks only the canonical playlist page",
  requested.length === 1 && requested[0] === `https://www.youtube.com/playlist?list=${YT.externalId}`,
  JSON.stringify(requested));
check("a Topic channel becomes the artist", tracks[0]?.artist === "Jatin Lalit", String(tracks[0]?.artist));
check("an ordinary channel is kept as is", tracks[1]?.artist === "Pritam");
check("durations are parsed, hours included",
  tracks[0]?.durationMs === 409_000 && tracks[1]?.durationMs === 3_725_000,
  JSON.stringify(tracks.map((t) => t.durationMs)));
check("the watch URL is stored as what plays it",
  tracks[0]?.previewUrl === "https://www.youtube.com/watch?v=MbWpPuuU1Vc");
check("positions are contiguous after skips", tracks.map((t) => t.position).join() === "0,1");

ytBody = ytPage({ list: [{ playlistVideoRenderer: {
  videoId: "1nrKhy0z6JI", title: { runs: [{ text: "Kal Ho Naa Ho" }] },
  shortBylineText: { runs: [{ text: "Sonu Nigam - Topic" }] }, lengthSeconds: "321",
} }, { playlistVideoRenderer: { videoId: "ic7dA4wYpFk", title: { simpleText: "Gone" }, isPlayable: false } }] });
tracks = await fetchPublicTracks(YT);
check("the older renderer layout still reads",
  tracks.length === 1 && tracks[0].title === "Kal Ho Naa Ho" && tracks[0].artist === "Sonu Nigam" &&
    tracks[0].durationMs === 321_000,
  JSON.stringify(tracks));

ytBody = "<html>consent wall</html>";
check("a YouTube page without data yields nothing", (await fetchPublicTracks(YT)).length === 0);
ytBody = "<html><script>var ytInitialData = {not json};</script></html>";
check("unparseable YouTube data yields nothing", (await fetchPublicTracks(YT)).length === 0);
ytBody = null;
check("a YouTube network failure yields nothing", (await fetchPublicTracks(YT)).length === 0);

const { showcaseTracks } = await import("../app/[username]/playlist-item");
const shown = showcaseTracks("YOUTUBE", [
  { position: 0, title: "a", artist: null, durationMs: null, previewUrl: "https://www.youtube.com/watch?v=MbWpPuuU1Vc" },
  { position: 1, title: "b", artist: null, durationMs: null, previewUrl: "https://evil.example/watch?v=MbWpPuuU1Vc" },
]);
check("the page gets a video id, never the stored URL",
  shown[0].videoId === "MbWpPuuU1Vc" && shown[0].previewUrl === null && shown[1].videoId === null,
  JSON.stringify(shown));

console.log(
  failures === 0
    ? "\nAll public-track checks passed."
    : `\n${failures} public-track check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
