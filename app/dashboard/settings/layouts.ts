/**
 * How a profile arranges its playlists. Shared by the settings form, the action
 * that saves it and the page that reads it, so all three agree on what is valid.
 *
 * Lives outside actions.ts because a "use server" file may only export async
 * functions.
 */
export const PLAYLIST_LAYOUTS = ["stacked", "arc"] as const;

export type PlaylistLayout = (typeof PLAYLIST_LAYOUTS)[number];

export const DEFAULT_LAYOUT: PlaylistLayout = "stacked";

/** Anything unrecognised falls back, so an old or hand-edited value is safe. */
export function asPlaylistLayout(value: unknown): PlaylistLayout {
  return PLAYLIST_LAYOUTS.includes(value as PlaylistLayout)
    ? (value as PlaylistLayout)
    : DEFAULT_LAYOUT;
}
