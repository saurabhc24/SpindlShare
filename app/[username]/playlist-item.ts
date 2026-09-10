import type { MusicProvider } from "@/app/generated/prisma/enums";

/**
 * One playlist as the public profile needs it: enough to draw a card and open
 * a player, and nothing else.
 *
 * Its own module so the deck, the profile and the player can share it without
 * importing each other -- it used to live beside the player-importing showcase,
 * which made that import cycle back on itself.
 */
export type ShowcaseItem = {
  id: string;
  title: string;
  provider: MusicProvider;
  providerLabel: string;
  coverImageUrl: string | null;
  trackCount: number | null;
  externalUrl: string;
  /** Needed to build the embed URL; never rendered. */
  externalId: string;
};
