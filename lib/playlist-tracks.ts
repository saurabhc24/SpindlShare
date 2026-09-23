import "server-only";

import type { NormalizedTrack } from "./providers/types";
import { PlaylistLinkError, type ParsedPlaylistLink } from "./playlist-link";

/**
 * Reads a public playlist's songs without an account.
 *
 * Spotify's embed page ships its own track list in a `__NEXT_DATA__` blob, and
 * YouTube's playlist page one in `ytInitialData`, so the songs are there for
 * anyone who can see the playlist. oEmbed publishes a title and a thumbnail and
 * nothing else, which is why this exists separately.
 *
 * That blob is an internal structure with no compatibility promise, so every
 * step here is written to give up rather than throw: a shape change costs the
 * song list, never the page.
 */

const FETCH_TIMEOUT_MS = 8000;
/** A playlist page is ~160KB; well past that is not a page we understand. */
const MAX_BYTES = 4_000_000;
/** Stored per playlist. Beyond this the player links out instead. */
const MAX_TRACKS = 200;

/** Spotify joins artists with a non-breaking space, which reads oddly stored. */
function tidy(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

type EmbedTrack = {
  title?: unknown;
  subtitle?: unknown;
  duration?: unknown;
  entityType?: unknown;
  audioPreview?: { url?: unknown } | null;
};

/**
 * Walks to the track list without trusting any single step of the path.
 * Written as a search rather than a fixed path so a nesting change still finds
 * it, and a rename simply yields nothing.
 */
function findTrackList(node: unknown, depth = 0): EmbedTrack[] | null {
  if (depth > 10 || node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const entry of node.slice(0, 60)) {
      const found = findTrackList(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  const list = record.trackList;
  if (Array.isArray(list)) return list as EmbedTrack[];

  for (const value of Object.values(record)) {
    const found = findTrackList(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * The songs on a public playlist, or an empty list when they cannot be read.
 *
 * Never throws for a shape or network problem: the caller is a refresh that
 * must still update the title and cover even when the songs are unavailable.
 */
export async function fetchPublicTracks(
  link: ParsedPlaylistLink
): Promise<NormalizedTrack[]> {
  if (link.provider === "YOUTUBE") return fetchYouTubeTracks(link.externalId);
  if (link.provider !== "SPOTIFY") return [];
  if (!/^[A-Za-z0-9]{16,40}$/.test(link.externalId)) return [];

  const html = await fetchPage(`https://open.spotify.com/embed/playlist/${link.externalId}`);
  if (!html) return [];

  const match = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const list = findTrackList(parsed);
  if (!list) return [];

  const tracks: NormalizedTrack[] = [];
  for (const entry of list) {
    if (tracks.length >= MAX_TRACKS) break;
    // Podcast episodes ride the same list; only songs belong here.
    if (entry?.entityType && entry.entityType !== "track") continue;

    const title = typeof entry?.title === "string" ? tidy(entry.title) : "";
    if (!title) continue;

    const artist =
      typeof entry?.subtitle === "string" ? tidy(entry.subtitle) : "";
    const duration =
      typeof entry?.duration === "number" && entry.duration > 0
        ? Math.round(entry.duration)
        : null;

    // The only audio a signed-out visitor can hear. Restricted to Spotify's
    // own host: this ends up in an <audio src>, so an arbitrary URL from a
    // response we do not control has no business there.
    const preview =
      typeof entry?.audioPreview?.url === "string" &&
      /^https:\/\/[a-z0-9-]+\.scdn\.co\//i.test(entry.audioPreview.url)
        ? entry.audioPreview.url.slice(0, 500)
        : null;

    tracks.push({
      position: tracks.length,
      title: title.slice(0, 300),
      artist: artist ? artist.slice(0, 300) : null,
      durationMs: duration,
      previewUrl: preview,
    });
  }

  return tracks;
}

/** A page's HTML, or null on any failure. Both providers need a browser agent to include their data. */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SpindlShare/1.0; +https://spindlshare.vercel.app)",
        "Accept-Language": "en",
        Accept: "text/html",
      },
    });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const html = await response.text();
    return html.length > MAX_BYTES ? null : html;
  } catch {
    return null;
  }
}

/** The watch URL is what plays a YouTube track, so it is stored where a preview would be. */
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** "3:07" or "1:02:45" to milliseconds; null for anything else ("LIVE", "SHORTS"). */
function clockToMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}(:\d{2}){1,2}$/.test(value)) return null;
  const ms = value.split(":").reduce((total, part) => total * 60 + Number(part), 0) * 1000;
  return ms > 0 ? ms : null;
}

function firstText(value: unknown): string {
  const node = value as { simpleText?: unknown; runs?: { text?: unknown }[]; content?: unknown } | null;
  const text = node?.content ?? node?.simpleText ?? node?.runs?.[0]?.text;
  return typeof text === "string" ? tidy(text) : "";
}

/** The first clock-shaped badge anywhere under a lockup: its duration. */
function findClock(node: unknown, depth = 0): number | null {
  if (depth > 12 || node === null || typeof node !== "object") return null;
  const text = (node as { text?: unknown }).text;
  const ms = typeof text === "string" ? clockToMs(text) : null;
  if (ms) return ms;
  for (const value of Object.values(node)) {
    const found = findClock(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** One entry from either of the two layouts YouTube serves a playlist page in. */
function youTubeEntry(key: string, raw: unknown): NormalizedTrack | null {
  const entry = raw as Record<string, unknown> & {
    metadata?: {
      lockupMetadataViewModel?: {
        title?: unknown;
        metadata?: { contentMetadataViewModel?: { metadataRows?: { metadataParts?: { text?: unknown }[] }[] } };
      };
    };
  };
  let videoId: unknown, title: string, channel: string, durationMs: number | null;

  if (key === "lockupViewModel") {
    if (entry.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
    const meta = entry.metadata?.lockupMetadataViewModel;
    videoId = entry.contentId;
    title = firstText(meta?.title);
    channel = firstText(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text);
    durationMs = findClock(entry.contentImage);
  } else {
    if (entry.isPlayable === false) return null;
    videoId = entry.videoId;
    title = firstText(entry.title);
    channel = firstText(entry.shortBylineText);
    const seconds = Number(entry.lengthSeconds);
    durationMs = seconds > 0 ? seconds * 1000 : null;
  }

  if (typeof videoId !== "string" || !VIDEO_ID.test(videoId)) return null;
  // Removed videos stay in the list under a placeholder title.
  if (!title || /^\[(deleted|private) video\]$/i.test(title)) return null;
  // YouTube Music's art tracks come from "<artist> - Topic", which names the artist.
  const artist = channel.replace(/ - Topic$/, "");

  return {
    position: 0,
    title: title.slice(0, 300),
    artist: artist ? artist.slice(0, 300) : null,
    durationMs,
    previewUrl: youTubeWatchUrl(videoId),
  };
}

/**
 * The songs on a public YouTube or YouTube Music playlist, read from its page's
 * ytInitialData. That page lists the first 100; the rest need a signed request.
 */
async function fetchYouTubeTracks(id: string): Promise<NormalizedTrack[]> {
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(id)) return [];
  const html = await fetchPage(`https://www.youtube.com/playlist?list=${id}`);
  if (!html) return [];

  const match = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(html);
  if (!match) return [];
  let data: unknown;
  try {
    data = JSON.parse(match[1]);
  } catch {
    return [];
  }

  // Only the page body: the header and sidebar can carry lockups of their own.
  const body = (data as { contents?: unknown } | null)?.contents;
  const tracks: NormalizedTrack[] = [];
  const walk = (node: unknown, depth: number) => {
    if (tracks.length >= MAX_TRACKS || depth > 40 || node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "lockupViewModel" || key === "playlistVideoRenderer") {
        const track = youTubeEntry(key, value);
        if (track && tracks.length < MAX_TRACKS) tracks.push({ ...track, position: tracks.length });
      } else {
        walk(value, depth + 1);
      }
    }
  };
  walk(body, 0);
  return tracks;
}

/** Kept so the caller can tell "no songs" from "we could not look". */
export { PlaylistLinkError };
