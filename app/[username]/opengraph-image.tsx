import { ImageResponse } from "next/og";

import { getPublicProfile } from "@/lib/profile";

export const alt = "Playlists shared on SpindlShare";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Rendering an OG image is expensive (satori layout + PNG encode), and social
// crawlers hit it in bursts whenever a link is shared. Same ISR setup as the page
// itself, with a longer window since the image changes far less often than the
// page: without generateStaticParams this route falls back to `must-revalidate`
// and re-renders the PNG on every single crawl.
export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

// Next 16 passes `params` to image generators as a Promise.
export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const data = await getPublicProfile(username);

  const displayName = data?.profile.displayName || data?.profile.username || username;
  const covers = (data?.playlists ?? [])
    .map((playlist) => playlist.coverImageUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, 4);
  const playlistCount = data?.playlists.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#09090b",
          color: "#c8c8c8",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#c8c8c8" }}>
            @{data?.profile.username ?? username}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 600,
              color: "#ffffff",
              marginTop: 12,
              letterSpacing: "-0.02em",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "#c8c8c8",
              marginTop: 16,
            }}
          >
            {playlistCount > 0
              ? `${playlistCount} playlist${playlistCount === 1 ? "" : "s"} on Spotify & YouTube`
              : "Playlists on Spotify & YouTube"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 20 }}>
            {covers.map((cover) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={cover}
                src={cover}
                alt=""
                width={160}
                height={160}
                style={{ borderRadius: 16, objectFit: "cover" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#ffffff" }}>
            SpindlShare
          </div>
        </div>
      </div>
    ),
    size
  );
}
