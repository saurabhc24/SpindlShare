"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireProfile } from "@/lib/dal";
import {
  PlaylistLinkError,
  parsePlaylistLink,
  resolvePlaylistLink,
} from "@/lib/playlist-link";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimitAll } from "@/lib/rate-limit";

export type AddLinkState = { error?: string; success?: string } | undefined;

// Matches the gap sync uses, so manual and imported rows interleave cleanly.
const SORT_ORDER_STEP = 1000;

async function clientIpFromHeaders() {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

/**
 * Adds a playlist from a pasted link.
 *
 * Unlike sync, this defaults to visible: the user named this one playlist
 * deliberately, so hiding it would just be a second step to undo. Bulk import
 * defaults to hidden for the opposite reason -- nobody chose those individually.
 */
export async function addPlaylistLink(
  _prev: AddLinkState,
  formData: FormData
): Promise<AddLinkState> {
  const { user, profile } = await requireProfile();

  // Each add costs an outbound request to the provider, so it is limited on the
  // same budget as the rest of curation, per account and per IP together.
  const limited = await rateLimitAll([
    { key: `curation:user:${user.id}`, rule: RATE_LIMITS.curationPerAccount },
    { key: `curation:ip:${await clientIpFromHeaders()}`, rule: RATE_LIMITS.curationPerIp },
  ]);
  if (!limited.ok) {
    return { error: "You're adding these very quickly. Please wait a moment." };
  }

  const link = parsePlaylistLink(formData.get("url"));
  if (!link) {
    return {
      error:
        "That doesn't look like a playlist link. Paste a Spotify or YouTube playlist URL.",
    };
  }

  // Check for a duplicate before spending a request on the provider. This is
  // advisory -- the unique index below is what actually decides.
  const existing = await prisma.playlist.findUnique({
    where: {
      userId_provider_externalId: {
        userId: user.id,
        provider: link.provider,
        externalId: link.externalId,
      },
    },
    select: { id: true },
  });
  if (existing) return { error: "That playlist is already on your page." };

  const typedTitle = String(formData.get("title") ?? "").trim().slice(0, 200);
  const typedCover = String(formData.get("coverImageUrl") ?? "").trim();

  let resolved: { title: string; coverImageUrl: string | null };
  if (link.needsManualTitle) {
    // Services under OTHER publish nothing we can read, so the user is the only
    // source for a title. Refusing the link entirely would be worse: the card
    // only needs a name and a URL, and they have both.
    if (!typedTitle) {
      return { error: "Add a title for this playlist — we can't read it from that service." };
    }
    resolved = { title: typedTitle, coverImageUrl: null };
  } else {
    try {
      resolved = await resolvePlaylistLink(link);
    } catch (error) {
      if (error instanceof PlaylistLinkError) return { error: error.message };
      throw error;
    }
    // A typed title still wins, so a badly-named playlist can be relabelled at
    // the moment of adding rather than requiring an edit afterwards.
    if (typedTitle) resolved = { ...resolved, title: typedTitle };
  }

  // Only https: this lands in an <img src> on a public page, so a javascript:
  // or data: value has no business here. Same rule the oEmbed path applies.
  if (typedCover && /^https:\/\//i.test(typedCover) && typedCover.length <= 2048) {
    resolved = { ...resolved, coverImageUrl: typedCover };
  } else if (typedCover) {
    return { error: "The cover image must be an https:// image URL." };
  }

  const highest = await prisma.playlist.aggregate({
    where: { userId: user.id },
    _max: { sortOrder: true },
  });

  try {
    await prisma.playlist.create({
      data: {
        userId: user.id,
        // No connected account: this playlist was not imported from one, and
        // that null is what keeps sync from ever flagging it stale.
        connectedAccountId: null,
        provider: link.provider,
        externalId: link.externalId,
        title: resolved.title,
        coverImageUrl: resolved.coverImageUrl,
        externalUrl: link.externalUrl,
        visible: true,
        sortOrder: (highest._max.sortOrder ?? 0) + SORT_ORDER_STEP,
      },
    });
  } catch (error) {
    // Lost a race against another tab adding the same link.
    if (isUniqueConstraintError(error)) {
      return { error: "That playlist is already on your page." };
    }
    throw error;
  }

  revalidatePath(`/${profile.usernameNormalized}`);
  revalidatePath("/dashboard");

  return { success: `Added "${resolved.title}".` };
}

/**
 * Removes a playlist that was added by link.
 *
 * Scoped to rows with no connected account on purpose. Imported playlists are
 * curated by hiding them, because deleting one would only invite sync to import
 * it again on the next run; a pasted link has no such source, so removing it is
 * the only way to take it off the page.
 */
export async function removePlaylistLink(formData: FormData): Promise<void> {
  const { user, profile } = await requireProfile();

  const id = String(formData.get("playlistId") ?? "");
  if (!id) return;

  // Scoping by userId AND the null account means someone else's id, or an
  // imported playlist, simply matches nothing -- so this needs no ownership
  // check of its own and cannot delete something sync is responsible for.
  await prisma.playlist.deleteMany({
    where: { id, userId: user.id, connectedAccountId: null },
  });

  revalidatePath(`/${profile.usernameNormalized}`);
  revalidatePath("/dashboard");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
