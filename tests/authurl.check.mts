import "dotenv/config";

// Which authorization URL each provider builds, and whether "use a different
// account" actually reaches the provider's chooser. No database, no network.
//   npx tsx --conditions=react-server tests/authurl.check.mts

process.env.SPOTIFY_CLIENT_ID = "sid";
process.env.SPOTIFY_CLIENT_SECRET = "ssec";
process.env.SPOTIFY_REDIRECT_URI = "https://x.test/api/connect/spotify/callback";
process.env.GOOGLE_CLIENT_ID = "gid";
process.env.GOOGLE_CLIENT_SECRET = "gsec";
process.env.YOUTUBE_REDIRECT_URI = "https://x.test/api/connect/youtube/callback";

const { spotify } = await import("../lib/providers/spotify");
const { youtube } = await import("../lib/providers/youtube");

let fail = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${detail}`);
  if (!ok) fail++;
};

const sDefault = new URL(spotify.getAuthorizationUrl("st"));
const sSwitch = new URL(spotify.getAuthorizationUrl("st", { forceApproval: true }));
check("spotify default: no show_dialog", !sDefault.searchParams.has("show_dialog"),
  `show_dialog=${sDefault.searchParams.get("show_dialog")}`);
check("spotify switch: show_dialog=true", sSwitch.searchParams.get("show_dialog") === "true",
  `show_dialog=${sSwitch.searchParams.get("show_dialog")}`);
check("spotify switch keeps state+scope",
  sSwitch.searchParams.get("state") === "st" && !!sSwitch.searchParams.get("scope"),
  `state=${sSwitch.searchParams.get("state")}`);
check("spotify host is accounts.spotify.com", sSwitch.host === "accounts.spotify.com", sSwitch.host);

const yDefault = new URL(youtube.getAuthorizationUrl("st"));
const ySwitch = new URL(youtube.getAuthorizationUrl("st", { forceApproval: true }));
check("youtube default: prompt=consent", yDefault.searchParams.get("prompt") === "consent",
  `prompt=${yDefault.searchParams.get("prompt")}`);
check("youtube switch: adds select_account",
  ySwitch.searchParams.get("prompt") === "select_account consent",
  `prompt=${ySwitch.searchParams.get("prompt")}`);
check("youtube keeps access_type=offline",
  ySwitch.searchParams.get("access_type") === "offline",
  `access_type=${ySwitch.searchParams.get("access_type")}`);

const { syncFailureHint } = await import("../lib/sync-status");
const allowlist = syncFailureHint("error: Spotify playlist fetch failed: User not registered in the Developer Dashboard");
check("allowlist status maps to its hint", allowlist.includes("allowlist"), allowlist.slice(0, 58) + "...");

process.exit(fail ? 1 : 0);
