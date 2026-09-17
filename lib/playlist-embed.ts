/**
 * Official in-page players.
 *
 * Both Spotify and YouTube publish an embeddable player that needs no client id,
 * no token, no quota and no allowlist -- the same one that plays a link dropped
 * into Notion or a blog post. That is the only route to audio on a public page:
 * Spotify's Web Playback SDK needs the *visitor* to hold Premium and to have
 * authorized this app, which a development-mode app can grant to five people.
 *
 * Every other service is OTHER -- unknown by definition -- so it returns null
 * and keeps its link-out behaviour.
 *
 * Kept free of server-only imports so the same mapping runs in the browser and
 * in the checks.
 */

import type { MusicProvider } from "@/app/generated/prisma/enums";

/**
 * Heights the providers actually render at; the frame must match or it clips.
 *
 * Spotify picks its layout from the height it is given: 80 draws the compact
 * transport bar, while 152 and 352 both draw a track list of their own. We list
 * the songs ourselves below, so anything taller than 80 is a duplicate of them.
 */
const EMBED_HEIGHT = { SPOTIFY: 80, YOUTUBE: 200 } as const;

export type PlaylistEmbed = {
  src: string;
  /** Fixed frame height, for players that are a list rather than a picture. */
  height: number;
  /**
   * Set where the player has a native aspect ratio, so the frame can match it.
   *
   * YouTube renders 16:9 internally and pads whatever box it is given, so a
   * frame of any other shape adds a second set of bars around the first. Most
   * YouTube Music songs are "art tracks" -- a still cover with audio -- and the
   * padding is what made those read as a video window rather than a sleeve.
   */
  aspectRatio: string | null;
  /** What a visitor without a subscription actually hears, stated plainly. */
  note: string;
};

/**
 * Builds the embed URL for a playlist, or null when the provider has no player.
 *
 * The id is re-validated here rather than trusted: this string goes into an
 * iframe src, so a value carrying a quote or a path traversal must never reach
 * it, however it was stored.
 */
export function playlistEmbed(
  provider: MusicProvider,
  externalId: string
): PlaylistEmbed | null {
  if (provider === "SPOTIFY") {
    if (!/^[A-Za-z0-9]{16,40}$/.test(externalId)) return null;
    return {
      // theme=0 is the dark player, which is the only one that sits in this scene.
      src: `https://open.spotify.com/embed/playlist/${externalId}?theme=0`,
      height: EMBED_HEIGHT.SPOTIFY,
      // A control bar, not a picture -- it wants a fixed height.
      aspectRatio: null,
      note: "30-second previews — sign in to Spotify for full tracks",
    };
  }

  if (provider === "YOUTUBE") {
    if (!/^[A-Za-z0-9_-]{12,64}$/.test(externalId)) return null;
    return {
      src: `https://www.youtube.com/embed/videoseries?list=${externalId}`,
      height: EMBED_HEIGHT.YOUTUBE,
      aspectRatio: "16 / 9",
      note: "Full tracks, played from YouTube",
    };
  }

  // OTHER is an arbitrary service we know nothing about, so it keeps linking
  // out, which is the only thing that can work.
  return null;
}
