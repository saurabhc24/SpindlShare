"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { deleteReplacedAvatar } from "@/lib/avatar-storage";
import { signOut } from "@/lib/auth";
import { requireProfile } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimitAll } from "@/lib/rate-limit";
import { validateUsername } from "@/lib/username";

import { BIO_MAX } from "./limits";

export type ActionState = { error?: string; success?: string } | undefined;

const profileSchema = z.object({
  displayName: z.string().trim().max(50, "Display name is too long.").optional(),
  bio: z.string().trim().max(BIO_MAX, `Bio must be ${BIO_MAX} characters or fewer.`).optional(),
  isPublic: z.boolean(),
  // Written by the upload route, so this only ever carries a URL we produced.
  avatarUrl: z.string().url().max(500).optional().or(z.literal("")),
});

async function clientIpFromHeaders() {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function updateProfile(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, profile } = await requireProfile();

  const limited = await rateLimitAll([
    { key: `profile:user:${user.id}`, rule: RATE_LIMITS.profilePerAccount },
    { key: `profile:ip:${await clientIpFromHeaders()}`, rule: RATE_LIMITS.profilePerIp },
  ]);
  if (!limited.ok) {
    return { error: "Too many changes just now. Please wait a moment." };
  }

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") ?? undefined,
    bio: formData.get("bio") ?? undefined,
    // An unchecked checkbox submits nothing at all.
    isPublic: formData.get("isPublic") === "on",
    avatarUrl: formData.get("avatarUrl") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { displayName, bio, isPublic, avatarUrl } = parsed.data;

  await prisma.profile.update({
    where: { userId: user.id },
    data: {
      displayName: displayName || null,
      bio: bio || null,
      isPublic,
      // Absent means the picker was never touched; keep whatever is stored.
      ...(avatarUrl === undefined ? {} : { avatarUrl: avatarUrl || null }),
    },
  });

  // After the save, not before: an orphaned blob is untidy, but deleting first
  // and then failing to save would leave the profile pointing at nothing.
  if (avatarUrl !== undefined) {
    await deleteReplacedAvatar(profile.avatarUrl, avatarUrl || null);
  }

  // The public page is edge-cached, so it has to be invalidated explicitly or
  // the change won't show up for visitors.
  revalidatePath(`/${profile.usernameNormalized}`);
  revalidatePath("/dashboard/settings");

  return { success: "Saved." };
}

export async function changeUsername(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, profile } = await requireProfile();

  const limited = await rateLimitAll([
    { key: `profile:user:${user.id}`, rule: RATE_LIMITS.profilePerAccount },
    { key: `claim:ip:${await clientIpFromHeaders()}`, rule: RATE_LIMITS.claimUsernamePerIp },
  ]);
  if (!limited.ok) {
    return { error: "Too many username changes. Please try again later." };
  }

  const validation = validateUsername(formData.get("username"));
  if (!validation.ok) return { error: validation.message };

  const { username, normalized } = validation;

  if (normalized === profile.usernameNormalized) {
    // Casing-only edits still update the display form.
    if (username !== profile.username) {
      await prisma.profile.update({
        where: { userId: user.id },
        data: { username },
      });
      revalidatePath(`/${normalized}`);
      return { success: "Saved." };
    }
    return { success: "That's already your username." };
  }

  const previousNormalized = profile.usernameNormalized;
  const previousUsername = profile.username;

  try {
    await prisma.$transaction(async (tx) => {
      // Taking this name invalidates any redirect that pointed at its previous
      // owner, otherwise an old link would resolve to the wrong profile.
      await tx.usernameHistory.deleteMany({
        where: { usernameNormalized: normalized },
      });

      // Keep the released name pointing here so existing links keep working.
      await tx.usernameHistory.upsert({
        where: { usernameNormalized: previousNormalized },
        create: {
          usernameNormalized: previousNormalized,
          username: previousUsername,
          userId: user.id,
        },
        update: {
          userId: user.id,
          username: previousUsername,
          changedAt: new Date(),
        },
      });

      await tx.profile.update({
        where: { userId: user.id },
        data: { username, usernameNormalized: normalized },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { error: "That username was just taken. Please try another." };
    }
    throw error;
  }

  // Both paths are cached: the old one must start serving its redirect, and the
  // new one may hold a cached 404 from before it existed.
  revalidatePath(`/${previousNormalized}`);
  revalidatePath(`/${normalized}`);
  revalidatePath("/dashboard");
  // So this page's placeholder and its disabled button pick up the new handle.
  revalidatePath("/dashboard/settings");

  return { success: `Your page is now at /${normalized}.` };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Self-serve version of what an admin can already do: reversible, so support can
 * undo a misclick, and it signs every open session out at once.
 */
export async function deleteMyAccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, profile } = await requireProfile();

  const limited = await rateLimitAll([
    { key: `profile:user:${user.id}`, rule: RATE_LIMITS.profilePerAccount },
    { key: `profile:ip:${await clientIpFromHeaders()}`, rule: RATE_LIMITS.profilePerIp },
  ]);
  if (!limited.ok) return { error: "Too many attempts. Please wait a moment." };

  // Typed rather than clicked. It is reversible, but it still takes the page
  // down and signs the person out of every device.
  const confirmation = String(formData.get("confirmUsername") ?? "").trim();
  if (confirmation.toLowerCase() !== profile.usernameNormalized) {
    return { error: "Type your username exactly to confirm." };
  }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, deletedAt: true },
  });
  if (account?.deletedAt) return { error: "This account is already deleted." };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        // `email` is unique, so parking it here is what lets the address sign
        // up again -- and lets a restore put it back.
        deletedEmail: account?.email ?? null,
        email: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  revalidatePath(`/${profile.usernameNormalized}`);
  revalidatePath("/admin");

  // Sessions are already gone; this clears the cookie and lands them home.
  await signOut({ redirectTo: "/" });
  return { success: "Account deleted." };
}
