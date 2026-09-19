import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/dal";
import { parseProviderSlug } from "@/lib/providers";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/connect/[provider]/disconnect">
) {
  const { user, profile } = await requireProfile();

  const { provider: slug } = await context.params;
  const provider = parseProviderSlug(slug);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  // Playlist rows cascade from ConnectedAccount, so disconnecting also removes
  // that service's playlists from the public page.
  await prisma.connectedAccount.deleteMany({
    where: { userId: user.id, provider },
  });

  revalidatePath(`/${profile.username}`);
  revalidatePath("/dashboard");

  return NextResponse.json({ ok: true });
}
