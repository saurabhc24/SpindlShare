import { AVATAR_MAX_EDGE, AVATAR_QUALITY } from "@/lib/avatar-storage";

/**
 * Shrinks a picked photo to avatar size before it is uploaded.
 *
 * A 4MB phone photo becomes tens of KB, which is what stops the store filling
 * up and what stops a 32px header avatar costing megabytes to render.
 */
export async function resizeAvatar(file: File): Promise<File> {
  // Animated GIFs would be flattened to their first frame by a canvas, so they
  // are passed through untouched rather than silently broken.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  try {
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Already small enough, and re-encoding could only lose quality or add bytes.
    if (scale === 1 && file.size <= 256 * 1024) return file;

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", AVATAR_QUALITY)
    );
    // A browser without WebP encoding hands back null, or a PNG that is larger
    // than the original. Either way the original is the better upload.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}
