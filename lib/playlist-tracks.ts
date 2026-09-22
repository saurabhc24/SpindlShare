import "server-only";

import type { NormalizedTrack } from "./providers/types";
import { PlaylistLinkError, type ParsedPlaylistLink } from "./playlist-link";

/**
 * Reads a public playlist's songs without an account.
 *
 * Spotify's embed page ships its own track list in a `__NEXT_DATA__` blob, so
 * the songs are there for anyone who can see the playlist. oEmbed publishes a
 * title and a thumbnail and nothing else, which is why this exists separately.
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
  return value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

type EmbedTrack = {
  title?: unknown;
  subtitle?: unknown;
  duration?: unknown;
  entityType?: unknown;
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
  // Only Spotify publishes this. YouTube's embed carries no track list at all.
  if (link.provider !== "SPOTIFY") return [];
  if (!/^[A-Za-z0-9]{16,40}$/.test(link.externalId)) return [];

  let html: string;
  try {
    const response = await fetch(
      `https://open.spotify.com/embed/playlist/${link.externalId}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
        // Without a browser agent the embed serves a shell with no data in it.
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; SpindlShare/1.0; +https://spindlshare.vercel.app)",
          Accept: "text/html",
        },
      }
    );
    if (!response.ok) return [];

    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return [];
    html = await response.text();
    if (html.length > MAX_BYTES) return [];
  } catch {
    return [];
  }

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

    tracks.push({
      position: tracks.length,
      title: title.slice(0, 300),
      artist: artist ? artist.slice(0, 300) : null,
      durationMs: duration,
    });
  }

  return tracks;
}

/** Kept so the caller can tell "no songs" from "we could not look". */
export { PlaylistLinkError };
