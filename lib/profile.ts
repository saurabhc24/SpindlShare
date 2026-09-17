import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { normalizeUsername } from "@/lib/username";

/**
 * Loads a public profile and the playlists it chooses to show, in display order.
 * Memoized per render pass so `generateMetadata` and the page body share one query.
 *
 * The profile lookup is a single indexed hit on Profile.usernameNormalized.
 */
/** Songs sent to the public page per playlist. Beyond this it links out. */
export const PUBLIC_TRACK_LIMIT = 100;

export const getPublicProfile = cache(async (username: string) => {
  const normalized = normalizeUsername(username);

  const profile = await prisma.profile.findUnique({
    where: { usernameNormalized: normalized },
    include: { user: { select: { deletedAt: true } } },
  });

  // Three independent reasons a page may be invisible: the owner turned it off,
  // an admin suspended it, or the account was deleted. All render as an ordinary
  // 404 -- a suspended page shouldn't announce that it was suspended, and a
  // deleted one shouldn't announce that it ever existed.
  //
  // Deletion is checked here rather than by removing the Profile row, because
  // the row is what makes the delete reversible; the cost is that this lookup
  // now has to ask about the owner.
  if (
    !profile ||
    profile.user.deletedAt ||
    !profile.isPublic ||
    profile.suspendedAt
  ) {
    return null;
  }

  const playlists = await prisma.playlist.findMany({
    where: { userId: profile.userId, visible: true },
    orderBy: { sortOrder: "asc" },
    // Songs ride along with the page: a visitor holds no provider token, so
    // this is the only place the list can come from. Capped because every
    // track is serialised into the HTML of a page that may show many playlists.
    include: {
      tracks: {
        orderBy: { position: "asc" },
        take: PUBLIC_TRACK_LIMIT,
        select: { position: true, title: true, artist: true, durationMs: true },
      },
    },
  });

  return { profile, playlists };
});

/**
 * Looks up a username a profile used to hold, so a stale link can redirect to
 * the current one rather than 404. Only consulted after the profile lookup
 * misses, so the common path stays a single query.
 *
 * Returns null until renames ship and this table starts getting rows.
 */
export const getRenamedProfileTarget = cache(async (username: string) => {
  const normalized = normalizeUsername(username);

  const historical = await prisma.usernameHistory.findUnique({
    where: { usernameNormalized: normalized },
    select: {
      user: {
        select: {
          deletedAt: true,
          profile: {
            select: {
              usernameNormalized: true,
              isPublic: true,
              suspendedAt: true,
            },
          },
        },
      },
    },
  });

  const target = historical?.user.profile;
  // Don't redirect onto a page that is itself hidden, suspended or deleted --
  // that would turn a 404 into a redirect to another 404, and leak that the
  // account exists.
  if (
    !target ||
    historical?.user.deletedAt ||
    !target.isPublic ||
    target.suspendedAt
  ) {
    return null;
  }

  return target.usernameNormalized;
});
