/**
 * Adding a playlist by pasting its link.
 *
 * This exists because neither provider will let an unreviewed app import on
 * behalf of arbitrary users: Spotify caps a development-mode app at five
 * hand-added accounts, and Google requires verification before a sensitive
 * scope reaches the public. A pasted link needs no account of any kind, so it
 * is the only path to a playlist that works for every user of SpindlShare.
 *
 * Parsing is deliberately free of server-only imports, so the same rules give
 * instant feedback in the browser and remain the source of truth on the server.
 */

import type { MusicProvider } from "@/app/generated/prisma/enums";

export type ParsedPlaylistLink = {
  provider: MusicProvider;
  externalId: string;
  /**
   * For Spotify and YouTube, a canonical URL we rebuild from a validated id --
   * never the string the user pasted. For OTHER there is no id to rebuild
   * from, so it is the pasted URL with its fragment and credentials stripped,
   * kept only because it is what the link must point at.
   */
  externalUrl: string;
  /**
   * True when no public endpoint will tell us the title, so the user has to.
   * Only Spotify and YouTube publish one; OTHER is by definition a service we
   * know nothing about.
   */
  needsManualTitle: boolean;
};

/**
 * Spotify ids are base62; YouTube list ids add - and _. Both are length-capped
 * so a pathological string can't be carried into a URL or a database column.
 */
const SPOTIFY_ID = /^[A-Za-z0-9]{16,40}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{12,64}$/;

/**
 * Extracts the provider and playlist id from a pasted link.
 *
 * Returns null for anything unrecognized rather than guessing. The id is then
 * used to rebuild a canonical URL from a hardcoded prefix -- the pasted string
 * is never fetched or stored, so a crafted link cannot point our server at an
 * arbitrary host.
 */
export function parsePlaylistLink(input: unknown): ParsedPlaylistLink | null {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw || raw.length > 2048) return null;

  // Spotify's own share menu hands out URIs as well as URLs.
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(raw);
  if (uri && SPOTIFY_ID.test(uri[1])) return spotifyLink(uri[1]);

  // Anything carrying a scheme that isn't http(s) is rejected before the
  // prepend below can mangle it into something valid-looking:
  // "file:///etc/passwd" would otherwise become "https://file///etc/passwd",
  // which parses cleanly and would be stored as a playlist link.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const isHttp = /^https?:\/\//i.test(raw);
  if (hasScheme && !isHttp) return null;

  let url: URL;
  try {
    // A bare "open.spotify.com/..." paste has no scheme; assume https rather
    // than rejecting, since that is what the user meant.
    url = new URL(isHttp ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    // Localized share links carry a segment before the type:
    // /intl-de/playlist/{id}. Match the id by position after "playlist".
    const segments = url.pathname.split("/").filter(Boolean);
    const index = segments.indexOf("playlist");
    const id = index === -1 ? null : segments[index + 1];
    if (id && SPOTIFY_ID.test(id)) return spotifyLink(id);
    return null;
  }

  if (
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "m.youtube.com"
  ) {
    // Covers /playlist?list=, and a /watch?v=...&list= link copied while
    // playing a video from the playlist.
    const list = url.searchParams.get("list");
    // A playlist made in YouTube Music keeps music.youtube.com as its home.
    // Rewriting it to www.youtube.com used to look like harmless
    // canonicalisation, but the regular YouTube playlist view omits Music's
    // "art tracks" -- the auto-generated "<artist> - Topic" uploads that most
    // YouTube Music songs actually are -- so a six-song playlist arrived
    // showing one. The id is identical either way; only the surface differs.
    if (list && YOUTUBE_ID.test(list)) {
      return youtubeLink(list, host === "music.youtube.com");
    }
    return null;
  }

  // Anything else that is a plausible https link to a playlist somewhere. There
  // is nothing to validate against, so the URL itself is the identity -- which
  // is what stops the same link being added twice.
  if (url.protocol !== "https:") return null;
  const cleaned = cleanUrl(url);
  if (cleaned.length > 512) return null;
  return {
    provider: "OTHER",
    externalId: cleaned,
    externalUrl: cleaned,
    needsManualTitle: true,
  };
}

/**
 * Strips the fragment and any embedded credentials, and drops a trailing slash,
 * so the same playlist pasted twice resolves to one identity. Query strings are
 * kept: some services carry the playlist id there.
 */
function cleanUrl(url: URL): string {
  url.hash = "";
  url.username = "";
  url.password = "";
  const href = url.toString();
  return href.endsWith("/") && url.pathname !== "/" ? href.slice(0, -1) : href;
}

function spotifyLink(externalId: string): ParsedPlaylistLink {
  return {
    provider: "SPOTIFY",
    externalId,
    externalUrl: `https://open.spotify.com/playlist/${externalId}`,
    needsManualTitle: false,
  };
}

function youtubeLink(externalId: string, music = false): ParsedPlaylistLink {
  return {
    provider: "YOUTUBE",
    externalId,
    externalUrl: music
      ? `https://music.youtube.com/playlist?list=${externalId}`
      : `https://www.youtube.com/playlist?list=${externalId}`,
    needsManualTitle: false,
  };
}

/**
 * YouTube Music is the same provider and the same playlist id, but a different
 * surface -- and the one a listener should be sent to when that is where the
 * playlist lives. Derived from the stored URL rather than a column, since the
 * URL already records it.
 */
export function isYouTubeMusic(externalUrl: string): boolean {
  return externalUrl.startsWith("https://music.youtube.com/");
}

/** The name to show a visitor: "YouTube Music" where that is the real home. */
export function surfaceLabel(
  provider: MusicProvider,
  externalUrl: string,
  fallback: string
): string {
  return provider === "YOUTUBE" && isYouTubeMusic(externalUrl)
    ? "YouTube Music"
    : fallback;
}

export type ResolvedPlaylist = {
  title: string;
  coverImageUrl: string | null;
};

export class PlaylistLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaylistLinkError";
  }
}

/** Providers are slow sometimes; a paste shouldn't hang the form indefinitely. */
const RESOLVE_TIMEOUT_MS = 8000;

/**
 * Reads a playlist's title and cover from the provider's public oEmbed endpoint.
 *
 * oEmbed is the whole point of this feature: it needs no client id, no token, no
 * user consent and has no per-user quota -- it is the same public endpoint that
 * makes these links unfurl in chat apps. It only describes *public* playlists,
 * which is the correct boundary anyway: a SpindlShare page is public, so a playlist
 * that can't be seen without logging in has no business being listed on one.
 */
export async function resolvePlaylistLink(
  link: ParsedPlaylistLink
): Promise<ResolvedPlaylist> {
  // Callers must supply the title for these; there is nothing to ask.
  if (link.needsManualTitle) {
    throw new PlaylistLinkError(
      "That service doesn't publish playlist details, so a title is required."
    );
  }

  // Built from `link.externalUrl`, which we constructed from a validated id --
  // not from anything the user typed.
  const endpoint =
    link.provider === "SPOTIFY"
      ? `https://open.spotify.com/oembed?url=${encodeURIComponent(link.externalUrl)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          // Always ask www: music.youtube.com returns its app shell for every
          // path, /oembed included, so it answers 200 with HTML and no data.
          `https://www.youtube.com/playlist?list=${link.externalId}`
        )}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new PlaylistLinkError(
      "Couldn't reach the service to check that link. Please try again."
    );
  }

  // Both providers answer 401/403/404 for a playlist that is private, deleted,
  // or never existed. None of those are distinguishable from outside, and the
  // user's next step is the same for all three.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    // YouTube's oEmbed also 401s some public playlists; their page still says what they are.
    const page = link.provider === "YOUTUBE" ? await readYouTubePage(link.externalId) : null;
    if (page) return page;
    throw new PlaylistLinkError(
      "That playlist is private or doesn't exist. Only public playlists can be added by link."
    );
  }
  if (!response.ok) {
    throw new PlaylistLinkError(
      "The service couldn't describe that playlist right now. Please try again."
    );
  }

  let payload: { title?: unknown; thumbnail_url?: unknown };
  try {
    payload = await response.json();
  } catch {
    throw new PlaylistLinkError("Got an unreadable response for that link.");
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim().slice(0, 200)
      : "Untitled playlist";

  // Only accept an https image URL: it goes straight into an <img src> on a
  // public page, so a javascript: or data: value has no business here.
  const thumbnail =
    typeof payload.thumbnail_url === "string" &&
    /^https:\/\//i.test(payload.thumbnail_url)
      ? payload.thumbnail_url
      : null;

  return { title, coverImageUrl: thumbnail };
}

/** The og tags sit ~760KB into a playlist page; far past that is not one. */
const PAGE_MAX_BYTES = 3_000_000;

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaTag(html: string, property: string): string | null {
  const match = new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html);
  return match ? decodeEntities(match[1]).trim() : null;
}

/**
 * Title and cover from the public playlist page, or null if it isn't one.
 * A missing or private playlist renders with og:url "undefined", so og:url must name this list.
 */
async function readYouTubePage(id: string): Promise<ResolvedPlaylist | null> {
  if (!YOUTUBE_ID.test(id)) return null;
  let html: string;
  try {
    const response = await fetch(`https://www.youtube.com/playlist?list=${id}`, {
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpindlShare/1.0; +https://spindlshare.vercel.app)",
        "Accept-Language": "en",
        Accept: "text/html",
      },
    });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length") ?? 0) > PAGE_MAX_BYTES) return null;
    html = await response.text();
    if (html.length > PAGE_MAX_BYTES) return null;
  } catch {
    return null;
  }

  const url = metaTag(html, "og:url");
  if (!url || !url.endsWith(`list=${id}`)) return null;
  const title = metaTag(html, "og:title");
  if (!title || title === "undefined") return null;

  const image = metaTag(html, "og:image");
  return {
    title: title.slice(0, 200),
    coverImageUrl: image && /^https:\/\/i\d?\.ytimg\.com\//i.test(image) ? image : null,
  };
}
