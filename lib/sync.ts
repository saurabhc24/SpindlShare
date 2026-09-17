import "server-only";

import type { ConnectedAccount } from "@/app/generated/prisma/client";

import { decryptNullable, encryptNullable } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  PROVIDERS,
  ProviderAuthError,
  ProviderRateLimitError,
  type ConnectableProvider,
} from "@/lib/providers";

/**
 * A ConnectedAccount only ever exists for a provider we can connect to, but the
 * column is typed as the full MusicProvider enum (which also contains the
 * link-only OTHER). This narrows it once, here, rather than at each PROVIDERS
 * lookup.
 */
type Connection = ConnectedAccount & { provider: ConnectableProvider };

// Refresh slightly early so a long fetch can't start with a token that expires
// mid-flight.
const EXPIRY_SKEW_MS = 60_000;
// sortOrder uses wide gaps so a drag-reorder usually rewrites one row, not all.
const SORT_ORDER_STEP = 1000;

export class SyncError extends Error {
  constructor(
    message: string,
    readonly needsReconnect = false,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/**
 * Returns a usable access token for the connection, refreshing and persisting a
 * new one first if the stored token is expired or about to be.
 */
async function getFreshAccessToken(connection: Connection) {
  const accessToken = decryptNullable(connection.accessTokenEncrypted);
  const refreshToken = decryptNullable(connection.refreshTokenEncrypted);

  const isExpired =
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now();

  if (accessToken && !isExpired) return accessToken;

  if (!refreshToken) {
    throw new SyncError(
      "This connection has no refresh token. Please reconnect the account.",
      true
    );
  }

  try {
    const tokens =
      await PROVIDERS[connection.provider].refreshAccessToken(refreshToken);

    await prisma.connectedAccount.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encryptNullable(tokens.accessToken),
        ...(tokens.refreshToken
          ? { refreshTokenEncrypted: encryptNullable(tokens.refreshToken) }
          : {}),
        expiresAt: tokens.expiresAt,
        ...(tokens.scope ? { scope: tokens.scope } : {}),
      },
    });

    return tokens.accessToken;
  } catch (error) {
    if (error instanceof ProviderAuthError) {
      throw new SyncError(
        "The connection was revoked or expired. Please reconnect the account.",
        true
      );
    }
    throw error;
  }
}

export type SyncResult = {
  imported: number;
  added: number;
  markedStale: number;
  /** Songs written for the visible playlists; 0 when none are shown yet. */
  tracksStored: number;
};

/**
 * Pulls the latest playlists for one connection and reconciles them into the DB.
 *
 * Curation is preserved across syncs: `visible` and `sortOrder` are only set when
 * a playlist is first seen. Playlists that disappear upstream are flagged stale
 * rather than deleted, so a user never silently loses a curated ordering.
 */
export async function syncProvider({
  userId,
  connection,
}: {
  userId: string;
  connection: Connection;
}): Promise<SyncResult> {
  try {
    const accessToken = await getFreshAccessToken(connection);
    let fetched;
    try {
      fetched = await PROVIDERS[connection.provider].fetchPlaylists(accessToken);
    } catch (error) {
      if (error instanceof ProviderRateLimitError) {
        throw new SyncError(error.message, false, error.retryAfterSeconds);
      }
      throw error;
    }

    const existing = await prisma.playlist.findMany({
      where: { userId, provider: connection.provider },
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((row) => row.externalId));

    // Ordering is unified across providers, so new rows go after everything the
    // user already has, regardless of which service they came from.
    const highest = await prisma.playlist.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    });
    let nextSortOrder = highest._max.sortOrder ?? 0;

    let added = 0;
    const now = new Date();

    for (const playlist of fetched) {
      const isNew = !existingIds.has(playlist.externalId);
      if (isNew) added++;

      await prisma.playlist.upsert({
        where: {
          userId_provider_externalId: {
            userId,
            provider: connection.provider,
            externalId: playlist.externalId,
          },
        },
        create: {
          userId,
          connectedAccountId: connection.id,
          provider: connection.provider,
          externalId: playlist.externalId,
          title: playlist.title,
          description: playlist.description,
          coverImageUrl: playlist.coverImageUrl,
          externalUrl: playlist.externalUrl,
          trackCount: playlist.trackCount,
          // New imports start hidden so connecting an account never dumps a
          // hundred playlists onto someone's public page unannounced.
          visible: false,
          sortOrder: (nextSortOrder += SORT_ORDER_STEP),
          lastSyncedAt: now,
        },
        update: {
          // Metadata refreshes; curation (visible/sortOrder) intentionally does not.
          connectedAccountId: connection.id,
          title: playlist.title,
          description: playlist.description,
          coverImageUrl: playlist.coverImageUrl,
          externalUrl: playlist.externalUrl,
          trackCount: playlist.trackCount,
          isStale: false,
          lastSyncedAt: now,
        },
      });
    }

    // Anything we previously knew about but didn't see this time is flagged, not
    // deleted. If the provider returned nothing at all, that's every row.
    const fetchedIds = fetched.map((playlist) => playlist.externalId);
    const { count: markedStale } = await prisma.playlist.updateMany({
      where: {
        userId,
        provider: connection.provider,
        isStale: false,
        // Playlists added by pasting a link have no connected account, and this
        // provider never claimed to import them -- so their absence from the
        // fetched list means nothing. Without this, one sync would flag every
        // manually added playlist of the same provider as "no longer available".
        connectedAccountId: { not: null },
        ...(fetchedIds.length > 0
          ? { externalId: { notIn: fetchedIds } }
          : {}),
      },
      data: { isStale: true },
    });

    // Tracks are fetched only for playlists actually on the public page. Every
    // other playlist would cost requests against a shared quota to store a list
    // no visitor can reach, and new imports start hidden.
    const visible = await prisma.playlist.findMany({
      where: {
        userId,
        provider: connection.provider,
        visible: true,
        isStale: false,
      },
      select: { id: true, externalId: true },
    });

    let tracksStored = 0;
    for (const playlist of visible) {
      let tracks;
      try {
        tracks = await PROVIDERS[connection.provider].fetchTracks(
          accessToken,
          playlist.externalId
        );
      } catch (error) {
        // Running out of quota part-way is worth surfacing, but the playlists
        // themselves already synced -- so it stops here rather than undoing them.
        if (error instanceof ProviderRateLimitError) break;
        throw error;
      }
      if (tracks.length === 0) continue;

      // Replaced wholesale: position is the identity, so a reordered or edited
      // playlist would otherwise leave rows from the previous shape behind.
      await prisma.$transaction([
        prisma.track.deleteMany({ where: { playlistId: playlist.id } }),
        prisma.track.createMany({
          data: tracks.map((track) => ({
            playlistId: playlist.id,
            position: track.position,
            title: track.title,
            artist: track.artist,
            durationMs: track.durationMs,
          })),
        }),
      ]);
      tracksStored += tracks.length;
    }

    await prisma.connectedAccount.update({
      where: { id: connection.id },
      data: { lastSyncedAt: now, lastSyncStatus: "ok" },
    });

    return { imported: fetched.length, added, markedStale, tracksStored };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync failure";

    await prisma.connectedAccount.update({
      where: { id: connection.id },
      data: { lastSyncStatus: `error: ${message}`.slice(0, 500) },
    });

    throw error;
  }
}
