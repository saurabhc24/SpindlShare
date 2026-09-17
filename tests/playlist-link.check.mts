import "dotenv/config";

// Parsing of pasted playlist links. No database and no network: every case here
// is about what we accept, what we reject, and what URL we rebuild.
//   npx tsx --conditions=react-server tests/playlist-link.check.mts

const { parsePlaylistLink, isYouTubeMusic, surfaceLabel } = await import(
  "../lib/playlist-link"
);

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const SPOTIFY_ID = "37i9dQZF1DXcBWIGoYBM5M";
const YT_ID = "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI";

console.log("\nSpotify links");
for (const [label, input] of [
  ["plain URL", `https://open.spotify.com/playlist/${SPOTIFY_ID}`],
  ["with ?si= share token", `https://open.spotify.com/playlist/${SPOTIFY_ID}?si=abc123`],
  ["localized share link", `https://open.spotify.com/intl-de/playlist/${SPOTIFY_ID}`],
  ["www subdomain", `https://www.open.spotify.com/playlist/${SPOTIFY_ID}`],
  ["no scheme", `open.spotify.com/playlist/${SPOTIFY_ID}`],
  ["spotify: URI", `spotify:playlist:${SPOTIFY_ID}`],
  ["surrounding whitespace", `  https://open.spotify.com/playlist/${SPOTIFY_ID}  `],
] as const) {
  const parsed = parsePlaylistLink(input);
  check(
    label,
    parsed?.provider === "SPOTIFY" && parsed.externalId === SPOTIFY_ID,
    JSON.stringify(parsed)
  );
}

check(
  "rebuilds a canonical URL rather than echoing the paste",
  parsePlaylistLink(`https://open.spotify.com/intl-de/playlist/${SPOTIFY_ID}?si=xyz`)
    ?.externalUrl === `https://open.spotify.com/playlist/${SPOTIFY_ID}`
);

console.log("\nYouTube links");
for (const [label, input] of [
  ["playlist URL", `https://www.youtube.com/playlist?list=${YT_ID}`],
  ["without www", `https://youtube.com/playlist?list=${YT_ID}`],
  ["YouTube Music", `https://music.youtube.com/playlist?list=${YT_ID}`],
  ["mobile", `https://m.youtube.com/playlist?list=${YT_ID}`],
  ["watch URL carrying a list", `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${YT_ID}`],
] as const) {
  const parsed = parsePlaylistLink(input);
  check(label, parsed?.provider === "YOUTUBE" && parsed.externalId === YT_ID, JSON.stringify(parsed));
}

check(
  "rebuilds a canonical YouTube URL from a watch link",
  parsePlaylistLink(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${YT_ID}`)
    ?.externalUrl === `https://www.youtube.com/playlist?list=${YT_ID}`
);

// music.youtube.com used to be rewritten to www.youtube.com, which looked like
// harmless canonicalisation but silently dropped the playlist's art tracks --
// the "<artist> - Topic" uploads most YouTube Music songs are -- so a six-song
// playlist arrived showing one.
console.log("\nYouTube Music keeps its own surface");
check(
  "a YouTube Music link stays on music.youtube.com",
  parsePlaylistLink(`https://music.youtube.com/playlist?list=${YT_ID}`)?.externalUrl ===
    `https://music.youtube.com/playlist?list=${YT_ID}`
);
check(
  "a regular YouTube link is never promoted to Music",
  parsePlaylistLink(`https://www.youtube.com/playlist?list=${YT_ID}`)?.externalUrl ===
    `https://www.youtube.com/playlist?list=${YT_ID}`
);
check(
  "both surfaces resolve to the same playlist id",
  parsePlaylistLink(`https://music.youtube.com/playlist?list=${YT_ID}`)?.externalId ===
    parsePlaylistLink(`https://www.youtube.com/playlist?list=${YT_ID}`)?.externalId
);
check(
  "the Music surface is labelled as such, and only it",
  surfaceLabel("YOUTUBE", `https://music.youtube.com/playlist?list=${YT_ID}`, "YouTube") ===
    "YouTube Music" &&
    surfaceLabel("YOUTUBE", `https://www.youtube.com/playlist?list=${YT_ID}`, "YouTube") ===
      "YouTube" &&
    isYouTubeMusic(`https://music.youtube.com/playlist?list=${YT_ID}`) &&
    !isYouTubeMusic(`https://www.youtube.com/playlist?list=${YT_ID}`)
);

// Amazon had a branch of its own until it earned nothing: no API, no oEmbed and
// no player, so a link cost the user a hand-typed title and produced a card with
// no artwork that could not be played. It is now simply another unknown service.
console.log("\nServices with no integration fall through to OTHER");
for (const [label, input] of [
  ["Amazon Music", "https://music.amazon.com/playlists/B07QK2LH4H"],
  ["Amazon Music, regional domain", "https://music.amazon.co.uk/playlists/B07QK2LH4H"],
  ["Apple Music", "https://music.apple.com/us/playlist/chill-mix/pl.abc123"],
  ["Tidal", "https://tidal.com/browse/playlist/abc-123"],
  ["SoundCloud", "https://soundcloud.com/someone/sets/late-night"],
] as const) {
  const parsed = parsePlaylistLink(input);
  check(
    label,
    parsed?.provider === "OTHER" && parsed.needsManualTitle,
    JSON.stringify(parsed)
  );
}

check(
  "nothing is attributed to Amazon any more",
  parsePlaylistLink("https://music.amazon.com/playlists/B07QK2LH4H")?.provider !== "AMAZON"
);

check(
  "a known provider is never downgraded to OTHER",
  parsePlaylistLink(`https://open.spotify.com/playlist/${SPOTIFY_ID}`)?.provider === "SPOTIFY"
);
check(
  "Spotify and YouTube never demand a manual title",
  parsePlaylistLink(`https://open.spotify.com/playlist/${SPOTIFY_ID}`)?.needsManualTitle === false &&
    parsePlaylistLink(`https://www.youtube.com/playlist?list=${YT_ID}`)?.needsManualTitle === false
);
check(
  "the fragment is stripped so one playlist has one identity",
  parsePlaylistLink("https://tidal.com/browse/playlist/abc-123#anchor")?.externalId ===
    parsePlaylistLink("https://tidal.com/browse/playlist/abc-123")?.externalId
);
check(
  "embedded credentials are stripped from an OTHER url",
  !(parsePlaylistLink("https://user:pass@tidal.com/browse/playlist/abc")?.externalUrl ?? "").includes("pass")
);

console.log("\nRejected");
for (const [label, input] of [
  ["empty string", ""],
  ["not a URL", "just some text"],
  // A known host with no playlist in it is rejected outright rather than
  // falling through to OTHER -- we know what these are, and they aren't one.
  ["a non-playlist Spotify link", `https://open.spotify.com/track/${SPOTIFY_ID}`],
  ["an album link", `https://open.spotify.com/album/${SPOTIFY_ID}`],
  ["a bare YouTube video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  ["javascript: scheme", "javascript:alert(1)"],
  ["data: URL", "data:text/html,<script>alert(1)</script>"],
  ["file: scheme", "file:///etc/passwd"],
  ["an id with illegal characters", "https://open.spotify.com/playlist/abc$%^&*()12345678"],
  ["an id that is far too short", "https://open.spotify.com/playlist/abc"],
  ["a non-string input", 12345],
  ["null", null],
] as const) {
  check(label, parsePlaylistLink(input) === null, JSON.stringify(parsePlaylistLink(input)));
}

check(
  "rejects an absurdly long input without evaluating it",
  parsePlaylistLink(`https://open.spotify.com/playlist/${"a".repeat(5000)}`) === null
);

// Unknown hosts now become OTHER rather than being rejected, so "not rejected"
// is no longer the interesting property -- "not mistaken for the real thing" is.
console.log("\nImpersonation");
for (const [label, input] of [
  ["a lookalike domain", `https://open.spotify.com.evil.test/playlist/${SPOTIFY_ID}`],
  ["a host with the real one in its path", `https://evil.test/open.spotify.com/playlist/${SPOTIFY_ID}`],
] as const) {
  const parsed = parsePlaylistLink(input);
  check(
    `${label} is never attributed to the real provider`,
    parsed === null || parsed.provider === "OTHER",
    JSON.stringify(parsed)
  );
}

// --- in-page players ---------------------------------------------------------

console.log("\nEmbeddable players");
const { playlistEmbed } = await import("../lib/playlist-embed");

const spotifyEmbed = playlistEmbed("SPOTIFY", SPOTIFY_ID);
check(
  "Spotify playlists get the official embed",
  spotifyEmbed?.src === `https://open.spotify.com/embed/playlist/${SPOTIFY_ID}?theme=0`,
  String(spotifyEmbed?.src)
);
check(
  "the Spotify preview limitation is stated to the visitor",
  /30-second/i.test(spotifyEmbed?.note ?? ""),
  spotifyEmbed?.note
);

const youtubeEmbed = playlistEmbed("YOUTUBE", YT_ID);
check(
  "YouTube playlists get the videoseries embed",
  youtubeEmbed?.src === `https://www.youtube.com/embed/videoseries?list=${YT_ID}`,
  String(youtubeEmbed?.src)
);

// YouTube pads whatever box it is given to its own 16:9, so a frame of any
// other shape draws a second set of bars around the first -- which is what made
// an art track's still sleeve read as a video window rather than a cover.
check(
  "the YouTube frame matches YouTube's own ratio",
  youtubeEmbed?.aspectRatio === "16 / 9"
);
check(
  "Spotify asks for the compact bar, since we list the songs ourselves",
  spotifyEmbed?.aspectRatio === null && spotifyEmbed?.height === 80
);

check(
  "OTHER has no player",
  playlistEmbed("OTHER", "https://tidal.com/browse/playlist/abc") === null
);

// The id reaches an iframe src, so it is re-validated at the point of use rather
// than trusted because it was validated on the way into the database.
for (const [label, id] of [
  ["a quote", `${SPOTIFY_ID}"onload=alert(1)`],
  ["a path traversal", "../../evil"],
  ["a query injection", `${SPOTIFY_ID}&foo=bar`],
  ["an empty id", ""],
] as const) {
  check(`Spotify rejects ${label} at embed time`, playlistEmbed("SPOTIFY", id) === null);
}
check(
  "YouTube rejects a crafted id at embed time",
  playlistEmbed("YOUTUBE", `${YT_ID}" onload="alert(1)`) === null
);

check(
  "exactly the two providers with an official player are playable",
  playlistEmbed("SPOTIFY", SPOTIFY_ID) !== null &&
    playlistEmbed("YOUTUBE", YT_ID) !== null &&
    playlistEmbed("OTHER", "https://music.amazon.com/playlists/B07QK2LH4H") === null
);

console.log(
  failures === 0 ? "\nAll playlist-link checks passed." : `\n${failures} check(s) FAILED.`
);
process.exit(failures === 0 ? 0 : 1);
