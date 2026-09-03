/**
 * Guards the one genuinely dangerous case in avatar cleanup: deleting a URL we
 * do not own. No DB, no network -- run with `npm run check:avatarblob`.
 */
import assert from "node:assert/strict";

import { isOwnAvatarBlob } from "@/lib/avatar-storage";

const OURS = "https://abc123.public.blob.vercel-storage.com/avatars/user_1-xyz.webp";

// Ours: delete these.
assert.equal(isOwnAvatarBlob(OURS), true, "our own avatar blob");

// Not ours: never delete these.
assert.equal(
  isOwnAvatarBlob("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c"),
  false,
  "Google account picture seeded at signup"
);
assert.equal(isOwnAvatarBlob(null), false, "no avatar set");
assert.equal(isOwnAvatarBlob(""), false, "empty string");
assert.equal(isOwnAvatarBlob("not a url"), false, "unparseable");
assert.equal(
  isOwnAvatarBlob("https://blob.vercel-storage.com.evil.test/avatars/x.webp"),
  false,
  "lookalike host must not match on substring"
);
assert.equal(
  isOwnAvatarBlob("http://abc.public.blob.vercel-storage.com/avatars/x.webp"),
  false,
  "plain http is not our store"
);
assert.equal(
  isOwnAvatarBlob("https://abc.public.blob.vercel-storage.com/playlists/x.webp"),
  false,
  "same store, but not an avatar path"
);

console.log("avatar blob ownership: all assertions passed");
