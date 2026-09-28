import "server-only";

import { providerLabel } from "@/components/provider-badge";
import { surfaceLabel } from "@/lib/playlist-link";
import { getPublicProfile } from "@/lib/profile";

/** Whose shelf the landing page is built from: real covers and songs, not mockups. */
export const SHOWCASE_USERNAME = "saurabhchandra";

export type ShowcaseRecord = {
  id: string;
  title: string;
  service: string;
  cover: string | null;
  /** YouTube thumbnails carry baked-in black bars, so they are cropped harder. */
  letterboxed: boolean;
  songs: number | null;
  url: string;
};

export type ShowcaseSong = {
  title: string;
  artist: string | null;
  durationMs: number | null;
  previewUrl: string;
};

export type Showcase = {
  records: ShowcaseRecord[];
  /** Playable previews from one Spotify playlist, for the turntable demo. */
  songs: ShowcaseSong[];
  songSource: ShowcaseRecord | null;
};

const EMPTY: Showcase = { records: [], songs: [], songSource: null };

/** Never throws: a build without a database still ships a page, just without the art. */
export async function getShowcase(): Promise<Showcase> {
  let data: Awaited<ReturnType<typeof getPublicProfile>>;
  try {
    data = await getPublicProfile(SHOWCASE_USERNAME);
  } catch {
    return EMPTY;
  }
  if (!data) return EMPTY;

  const records: ShowcaseRecord[] = data.playlists
    .filter((p) => p.provider === "SPOTIFY" || p.provider === "YOUTUBE")
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      service: surfaceLabel(p.provider, p.externalUrl, providerLabel(p.provider)),
      cover: p.coverImageUrl,
      letterboxed: /^https:\/\/i\d?\.ytimg\.com\//.test(p.coverImageUrl ?? ""),
      songs: p.trackCount ?? (p.tracks.length || null),
      url: p.externalUrl,
    }));

  // The richest Spotify list with real previews: those play in a plain <audio>.
  const source = data.playlists
    .filter((p) => p.provider === "SPOTIFY")
    .map((p) => ({ p, playable: p.tracks.filter((t) => t.previewUrl?.startsWith("https://")) }))
    .sort((a, b) => b.playable.length - a.playable.length)[0];

  const songs: ShowcaseSong[] = (source?.playable ?? []).slice(0, 6).map((t) => ({
    title: t.title,
    artist: t.artist,
    durationMs: t.durationMs,
    previewUrl: t.previewUrl as string,
  }));

  return {
    records,
    songs,
    songSource: source ? (records.find((r) => r.id === source.p.id) ?? null) : null,
  };
}
