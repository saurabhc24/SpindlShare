import { del } from "@vercel/blob";

/** Longest edge of a stored avatar. It is rendered at 64px at most, so this is
 *  already generous -- the slack is for high-DPI screens. */
export const AVATAR_MAX_EDGE = 512;
/** WebP at this quality is visually clean for a photo at avatar size. */
export const AVATAR_QUALITY = 0.85;

const BLOB_HOST = ".blob.vercel-storage.com";

/**
 * Whether a stored avatar URL is a blob this app uploaded.
 *
 * Load-bearing: a profile's avatarUrl can also be the Google account picture
 * seeded at signup, and calling del() on someone else's CDN URL is not ours to do.
 */
export function isOwnAvatarBlob(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Host suffix, not `includes`: "blob.vercel-storage.com.evil.test" contains
  // the string but is not the store.
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(BLOB_HOST) &&
    parsed.pathname.startsWith("/avatars/")
  );
}

/**
 * Drops the blob an avatar replaced. Never throws: a leaked blob is untidy, a
 * failed profile save is not, so the caller's save must not hinge on this.
 */
export async function deleteReplacedAvatar(
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined
): Promise<void> {
  if (!isOwnAvatarBlob(previousUrl)) return;
  if (previousUrl === nextUrl) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;

  try {
    await del(previousUrl!);
  } catch {
    // Orphaned rather than lost. Nothing the person saving can act on.
  }
}
