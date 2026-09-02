import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { requireProfile } from "@/lib/dal";
import { clientIp, rateLimitedResponse } from "@/lib/http";
import { RATE_LIMITS, rateLimitAll } from "@/lib/rate-limit";

/** Formats every browser can both pick and render. SVG is excluded: it can carry script. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const { user } = await requireProfile();

  const limited = await rateLimitAll([
    { key: `avatar:user:${user.id}`, rule: RATE_LIMITS.avatarPerAccount },
    { key: `avatar:ip:${clientIp(request)}`, rule: RATE_LIMITS.avatarPerIp },
  ]);
  if (!limited.ok) return rateLimitedResponse(limited);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Photo uploads aren't configured yet. Set BLOB_READ_WRITE_TOKEN." },
      { status: 501 }
    );
  }

  let file: unknown;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Couldn't read that upload." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was selected." }, { status: 400 });
  }

  // Checked here rather than trusted from the client: `accept` on the input is
  // a filter for the picker, not a guarantee about what arrives.
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Choose a JPEG, PNG, WebP or GIF image." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That image is over 4MB. Please choose a smaller one." },
      { status: 413 }
    );
  }

  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const blob = await put(`avatars/${user.id}.${extension}`, file, {
    access: "public",
    contentType: file.type,
    // The path is keyed by user id, so each upload would otherwise collide with
    // the last. A random suffix also stops a stale CDN copy being served.
    addRandomSuffix: true,
  });

  // Returned, not stored: the form saves it with the rest of the profile, so
  // picking a photo and then abandoning the page changes nothing.
  return NextResponse.json({ url: blob.url });
}
