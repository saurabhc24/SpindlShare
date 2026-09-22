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
check("YouTube is not attempted, having no such list",
  (await fetchPublicTracks(YT)).length === 0 && requested.length === 0,
  JSON.stringify(requested));

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

console.log(
  failures === 0
    ? "\nAll public-track checks passed."
    : `\n${failures} public-track check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
