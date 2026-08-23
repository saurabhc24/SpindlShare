import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { absoluteUrl, displayUrl } from "@/lib/app-url";
import { getPublicProfile, getRenamedProfileTarget } from "@/lib/profile";
import { surfaceLabel } from "@/lib/playlist-link";
import { normalizeUsername } from "@/lib/username";
import { providerLabel } from "@/components/provider-badge";

import { Showcase, type Shelf } from "./showcase";

/**
 * A shelf holds at most this many playlists.
 *
 * The scene lays a shelf out as a single row and then scales that row to fit, so
 * a shelf of twenty would be scaled down to illegibility. Three matches the
 * design and keeps every cover readable once a shelf is focused.
 */
const MAX_PER_SHELF = 3;

// Short ISR window as a safety net; dashboard mutations call revalidatePath on
// this route so edits show up immediately rather than waiting this out.
export const revalidate = 60;

// Required for ISR on a dynamic segment. Without it Next treats this route as
// fully dynamic and serves `Cache-Control: no-store`, meaning every profile view
// hits the database -- the opposite of what we want on the highest-traffic page
// in the app. Returning [] prerenders nothing at build time (we can't know
// usernames ahead of time); pages are generated on first request and then cached
// at the edge. Verified via `x-nextjs-cache: HIT` on repeat requests.
export async function generateStaticParams() {
  return [];
}

// Usernames not in the (empty) prerender list must still render on demand.
export const dynamicParams = true;

export async function generateMetadata(
  props: PageProps<"/[username]">
): Promise<Metadata> {
  const { username } = await props.params;
  const data = await getPublicProfile(username);

  if (!data) return { title: "Page not found" };

  const name = data.profile.displayName || data.profile.username;
  const title = `${name}'s playlists`;
  const description =
    data.profile.bio ||
    `Listen to playlists shared by ${name} on Spotify and YouTube.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicProfilePage(
  props: PageProps<"/[username]">
) {
  const { username } = await props.params;

  // Send every casing/compatibility variant to one canonical URL. Beyond
  // avoiding duplicate content, each variant would otherwise get its own ISR
  // cache entry and its own render, fragmenting the edge cache across
  // /demo, /Demo, /DEMO and so on.
  const canonical = normalizeUsername(username);
  if (canonical && canonical !== username) permanentRedirect(`/${canonical}`);

  const data = await getPublicProfile(username);

  if (!data) {
    // Before giving up, check whether this name was released by a profile that
    // has since been renamed, and send the visitor to its current home. A
    // permanent redirect so search engines and shared links follow the move.
    const currentUsername = await getRenamedProfileTarget(username);
    if (currentUsername) permanentRedirect(`/${currentUsername}`);
    notFound();
  }

  const { profile, playlists } = data;
  const displayName = profile.displayName || profile.username;

  // SpindlShare has no notion of a named shelf, so the closest honest grouping is the
  // service a playlist came from -- a real label, from data the user already
  // has, rather than an invented one. Within a shelf the user's own ordering is
  // preserved; a provider with more than MAX_PER_SHELF spills onto further
  // shelves of the same name rather than crowding one row.
  const byProvider = new Map<string, typeof playlists>();
  for (const playlist of playlists) {
    const group = byProvider.get(playlist.provider) ?? [];
    group.push(playlist);
    byProvider.set(playlist.provider, group);
  }

  const shelves: Shelf[] = [];
  for (const [provider, group] of byProvider) {
    for (let i = 0; i < group.length; i += MAX_PER_SHELF) {
      shelves.push({
        name: providerLabel(provider as (typeof playlists)[number]["provider"]),
        items: group.slice(i, i + MAX_PER_SHELF).map((playlist) => ({
          id: playlist.id,
          title: playlist.title,
          provider: playlist.provider,
          // "YouTube Music" where that is the playlist's real home.
          providerLabel: surfaceLabel(
            playlist.provider,
            playlist.externalUrl,
            providerLabel(playlist.provider)
          ),
          coverImageUrl: playlist.coverImageUrl,
          trackCount: playlist.trackCount,
          externalUrl: playlist.externalUrl,
          externalId: playlist.externalId,
        })),
      });
    }
  }

  if (shelves.length > 0) {
    return (
      <div className="flex-1">
        <Showcase
          displayName={displayName}
          handle={`@${profile.username}`}
          avatarUrl={profile.avatarUrl}
          bio={profile.bio}
          shelves={shelves}
          totalCount={playlists.length}
          shareUrl={absoluteUrl(`/${profile.usernameNormalized}`)}
          shareDisplay={displayUrl(`/${profile.usernameNormalized}`)}
        />
      </div>
    );
  }

  // Reached only when the profile has no visible playlists: there is no shelf to
  // build, and an empty rack reads as broken rather than as "nothing here yet".
  return (
    <div
      className="flex w-full flex-1 justify-center"
      style={{ background: "#060504" }}
    >
      <div
        className="flex w-full flex-col items-center justify-center px-8 text-center"
        style={{
          maxWidth: 460,
          minHeight: "100dvh",
          background:
            "radial-gradient(120% 80% at 50% -6%, oklch(0.24 0.02 70) 0%, oklch(0.16 0.015 65) 32%, oklch(0.09 0.01 60) 66%, #060504 100%)",
          fontFamily: "var(--font-manrope), sans-serif",
          color: "var(--ink-dim)",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: "50%",
            background:
              "conic-gradient(from 210deg, oklch(0.9 0.07 85), oklch(0.72 0.09 70), oklch(0.95 0.05 90), oklch(0.8 0.09 80))",
            padding: 2,
            boxShadow: "0 0 30px oklch(0.85 0.09 82 / 0.3)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              background:
                "linear-gradient(150deg, oklch(0.34 0.02 70), oklch(0.2 0.015 65))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt=""
                width={84}
                height={84}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span
                style={{
                  fontFamily: "var(--font-instrument-serif), serif",
                  fontSize: 38,
                  color: "var(--ink)",
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <h1
          style={{
            fontFamily: "var(--font-ubuntu), system-ui, sans-serif",
            fontWeight: 500,
            fontSize: 34,
            lineHeight: 1.1,
            margin: "22px 0 6px",
            color: "var(--ink)",
          }}
        >
          {displayName}
        </h1>
        <p style={{ fontSize: 13, color: "var(--accent)" }}>
          @{profile.username}
        </p>

        {profile.bio && (
          <p
            style={{
              marginTop: 18,
              maxWidth: 340,
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--ink-dim)",
            }}
          >
            {profile.bio}
          </p>
        )}

        <p
          style={{
            marginTop: 40,
            fontSize: 13,
            color: "var(--ink-dim)",
          }}
        >
          No playlists on the shelf yet. Check back soon.
        </p>

        <Link
          href="/"
          style={{
            marginTop: 48,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink-dim)",
          }}
        >
          Make your own SpindlShare
        </Link>
      </div>
    </div>
  );
}
