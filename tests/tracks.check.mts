import "dotenv/config";

// Exercises the REAL provider adapters' track fetching against a stubbed HTTP
// API: paging, the entries each provider returns that are not songs, and the
// caps that keep one playlist from spending the whole quota.
//   npx tsx --conditions=react-server tests/tracks.check.mts
//
// No database: this is the normalisation half of the feature. The storage half
// (which playlists are fetched, and replace-not-append) lives in sync.check.mts.
process.env.SPOTIFY_CLIENT_ID ??= "test-client-id";
process.env.SPOTIFY_CLIENT_SECRET ??= "test-client-secret";
process.env.SPOTIFY_REDIRECT_URI ??=
  "http://127.0.0.1:3000/api/connect/spotify/callback";
process.env.GOOGLE_CLIENT_ID ??= "test-google-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-secret";
process.env.YOUTUBE_REDIRECT_URI ??=
  "http://127.0.0.1:3000/api/connect/youtube/callback";

type FetchArgs = Parameters<typeof fetch>;

let spotifyPages: unknown[] = [];
let youtubePages: unknown[] = [];
const requested: string[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
  const url = typeof input === "string" ? input : input.toString();
  requested.push(url);

  if (url.includes("api.spotify.com")) {
    const body = spotifyPages.shift() ?? { items: [], next: null };
    if (body === "RATE_LIMIT") {
      return new Response("slow down", {
        status: 429,
        headers: { "retry-after": "12" },
      });
    }
    if (body === "GONE") return new Response("not found", { status: 404 });
    if (body === "EXPIRED") return new Response("expired", { status: 401 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (url.includes("googleapis.com/youtube")) {
    const body = youtubePages.shift() ?? { items: [] };
    if (body === "QUOTA") {
      return new Response("quotaExceeded", { status: 403 });
    }
    if (body === "FORBIDDEN") {
      return new Response("playlistNotFound", { status: 403 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return realFetch(input, init);
}) as typeof fetch;

const { spotify } = await import("../lib/providers/spotify");
const { youtube } = await import("../lib/providers/youtube");
const { ProviderAuthError, ProviderRateLimitError } = await import(
  "../lib/providers/types"
);

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const PLAYLIST = "37i9dQZF1DXcBWIGoYBM5M";
const YT_PLAYLIST = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI";

const sTrack = (name: string | null, ms: number | null, artists: string[], type = "track") => ({
  track: { name, duration_ms: ms, type, artists: artists.map((n) => ({ name: n })) },
});

console.log("\nSpotify");

spotifyPages = [
  {
    next: null,
    items: [
      sTrack("Nights", 307_000, ["Frank Ocean"]),
      sTrack("Redbone", 326_000, ["Childish Gambino", "Someone"]),
    ],
  },
];
requested.length = 0;
let tracks = await spotify.fetchTracks("token", PLAYLIST);
check("returns the songs in order", tracks.length === 2 && tracks[0].title === "Nights", JSON.stringify(tracks.map((t) => t.title)));
check("numbers them from zero", tracks[0].position === 0 && tracks[1].position === 1);
check("joins multiple artists", tracks[1].artist === "Childish Gambino, Someone", String(tracks[1].artist));
check("keeps durations", tracks[0].durationMs === 307_000, String(tracks[0].durationMs));
check(
  "asks only for the fields it stores",
  requested[0]?.includes("fields=") === true && requested[0]?.includes("duration_ms") === true,
  requested[0]
);

spotifyPages = [
  {
    next: null,
    items: [
      sTrack("Real Song", 200_000, ["A"]),
      // A podcast episode shares this endpoint but is not a song.
      sTrack("An Episode", 1_000, [], "episode"),
      // A local file or removed track comes back nameless.
      sTrack(null, null, []),
      { track: null },
      sTrack("Another", 210_000, []),
    ],
  },
];
tracks = await spotify.fetchTracks("token", PLAYLIST);
check("skips episodes, nameless and null entries", tracks.length === 2, JSON.stringify(tracks.map((t) => t.title)));
check(
  "positions stay contiguous after the skips",
  tracks[0].position === 0 && tracks[1].position === 1,
  JSON.stringify(tracks.map((t) => t.position))
);
check("an artistless track stores null, not an empty string", tracks[1].artist === null, String(tracks[1].artist));

spotifyPages = [
  { next: "https://api.spotify.com/v1/playlists/x/tracks?offset=100", items: [sTrack("One", 1000, ["A"])] },
  { next: null, items: [sTrack("Two", 1000, ["B"])] },
];
tracks = await spotify.fetchTracks("token", PLAYLIST);
check("follows paging", tracks.length === 2 && tracks[1].title === "Two", JSON.stringify(tracks.map((t) => t.title)));
check("keeps numbering across pages", tracks[1].position === 1, String(tracks[1].position));

// A playlist that never stops paging must not page forever.
spotifyPages = Array.from({ length: 40 }, () => ({
  next: "https://api.spotify.com/v1/playlists/x/tracks?offset=1",
  items: [sTrack("Loop", 1000, ["A"])],
}));
requested.length = 0;
tracks = await spotify.fetchTracks("token", PLAYLIST);
check("caps a runaway playlist", requested.length <= 10, `(requests=${requested.length})`);

spotifyPages = ["GONE"];
tracks = await spotify.fetchTracks("token", PLAYLIST);
check("a vanished playlist yields nothing rather than throwing", tracks.length === 0);

spotifyPages = ["RATE_LIMIT"];
let raised: unknown = null;
try {
  await spotify.fetchTracks("token", PLAYLIST);
} catch (error) {
  raised = error;
}
check("a rate limit is raised, not swallowed", raised instanceof ProviderRateLimitError, String(raised));
check(
  "and carries the wait the provider asked for",
  raised instanceof ProviderRateLimitError && raised.retryAfterSeconds === 12,
  String(raised instanceof ProviderRateLimitError ? raised.retryAfterSeconds : "?")
);

spotifyPages = ["EXPIRED"];
raised = null;
try {
  await spotify.fetchTracks("token", PLAYLIST);
} catch (error) {
  raised = error;
}
check("an expired token is raised so the caller can refresh", raised instanceof ProviderAuthError, String(raised));

requested.length = 0;
tracks = await spotify.fetchTracks("token", "not a real id'; drop--");
check("a malformed id never reaches the network", tracks.length === 0 && requested.length === 0, JSON.stringify(requested));

console.log("\nYouTube");

const yItem = (title: string | null, channel: string | null, videoId: string | null = "abc") => ({
  snippet: {
    title,
    videoOwnerChannelTitle: channel,
    resourceId: videoId ? { videoId } : {},
  },
});

youtubePages = [{ items: [yItem("Nights", "Frank Ocean"), yItem("Redbone", "Childish Gambino")] }];
tracks = await youtube.fetchTracks("token", YT_PLAYLIST);
check("returns the songs in order", tracks.length === 2 && tracks[0].title === "Nights", JSON.stringify(tracks.map((t) => t.title)));
check("uses the channel as the artist", tracks[0].artist === "Frank Ocean", String(tracks[0].artist));
check("stores no duration, which the endpoint does not carry", tracks[0].durationMs === null, String(tracks[0].durationMs));

youtubePages = [
  {
    items: [
      yItem("Real Song", "A"),
      // A removed video keeps its slot under a placeholder and has no id.
      yItem("Private video", null, null),
      yItem("Deleted video", null, null),
      yItem(null, "B"),
      yItem("Another", "C"),
    ],
  },
];
tracks = await youtube.fetchTracks("token", YT_PLAYLIST);
check("skips private, deleted and nameless entries", tracks.length === 2, JSON.stringify(tracks.map((t) => t.title)));
check(
  "positions stay contiguous after the skips",
  tracks[0].position === 0 && tracks[1].position === 1,
  JSON.stringify(tracks.map((t) => t.position))
);

youtubePages = [
  { items: [yItem("One", "A")], nextPageToken: "t2" },
  { items: [yItem("Two", "B")] },
];
tracks = await youtube.fetchTracks("token", YT_PLAYLIST);
check("follows paging", tracks.length === 2 && tracks[1].title === "Two", JSON.stringify(tracks.map((t) => t.title)));

youtubePages = Array.from({ length: 40 }, () => ({
  items: [yItem("Loop", "A")],
  nextPageToken: "again",
}));
requested.length = 0;
tracks = await youtube.fetchTracks("token", YT_PLAYLIST);
check("caps paging hard, the daily quota being shared", requested.length <= 4, `(requests=${requested.length})`);

youtubePages = ["QUOTA"];
raised = null;
try {
  await youtube.fetchTracks("token", YT_PLAYLIST);
} catch (error) {
  raised = error;
}
check("quota exhaustion stops the run", raised instanceof ProviderRateLimitError, String(raised));

// A 403 that is NOT quota is one playlist's problem, not the whole sync's.
youtubePages = ["FORBIDDEN"];
tracks = await youtube.fetchTracks("token", YT_PLAYLIST);
check("a forbidden playlist yields nothing rather than throwing", tracks.length === 0);

requested.length = 0;
tracks = await youtube.fetchTracks("token", "bad id!");
check("a malformed id never reaches the network", tracks.length === 0 && requested.length === 0, JSON.stringify(requested));

console.log(
  failures === 0 ? "\nAll track checks passed." : `\n${failures} track check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
