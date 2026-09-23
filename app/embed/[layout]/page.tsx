import { notFound } from "next/navigation";

import { Arc } from "@/app/[username]/arc";
import { Deck } from "@/app/[username]/deck";
import { showcaseTracks, type ShowcaseItem } from "@/app/[username]/playlist-item";
import { providerLabel } from "@/components/provider-badge";
import { getPublicProfile } from "@/lib/profile";
import { surfaceLabel } from "@/lib/playlist-link";

export const dynamic = "force-dynamic";

/**
 * The shelf on its own, for embedding in a case study.
 *
 * It renders the same Deck and Arc the public profile does, from the same
 * data, so the write-up can never drift from what actually ships. Only the
 * profile chrome is left off.
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ layout: string }>;
  searchParams: Promise<{ u?: string }>;
}) {
  const { layout } = await params;
  if (layout !== "stacked" && layout !== "arc") notFound();

  const { u } = await searchParams;
  const data = await getPublicProfile(u ?? "demo");
  if (!data) notFound();

  const items: ShowcaseItem[] = data.playlists.map((playlist) => ({
    id: playlist.id,
    title: playlist.title,
    provider: playlist.provider,
    providerLabel: surfaceLabel(
      playlist.provider,
      playlist.externalUrl,
      providerLabel(playlist.provider)
    ),
    coverImageUrl: playlist.coverImageUrl,
    trackCount: playlist.trackCount,
    externalUrl: playlist.externalUrl,
    externalId: playlist.externalId,
    tracks: showcaseTracks(playlist.provider, playlist.tracks),
  }));

  if (items.length === 0) notFound();

  return (
    <>
      {/* The dev-only badge is Next's, and this route exists to be filmed and
          screenshotted, so it has no business in frame. */}
      <style>{"nextjs-portal{display:none!important}"}</style>
      <div
        className="relative h-[100dvh] w-full overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 70% at 50% -10%, oklch(0.24 0.02 70) 0%, oklch(0.15 0.015 65) 34%, #060504 78%)",
        }}
      >
        {layout === "arc" ? <Arc items={items} /> : <Deck items={items} />}
      </div>
    </>
  );
}
