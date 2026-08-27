import Link from "next/link";

import { signOut } from "@/lib/auth";
import { requireProfile } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { PROVIDERS, providerSlug, type ConnectableProvider } from "@/lib/providers";
import { syncFailureHint } from "@/lib/sync-status";

import { PasteLinkForm } from "./paste-link-form";
import { PlaylistBoard, type MissingService, type PlaylistRow } from "./playlist-board";
import { SettingsMenu } from "./settings-menu";
import { WelcomeMoment } from "./welcome-moment";

/**
 * The signed-in home. Nothing connected and nothing pasted shows the invitation;
 * anything else shows the playlist board, which is the same screen with a shelf.
 */

/**
 * Where a round trip through a provider can land. The design has no box for this,
 * so it borrows the app's `.note` rather than inventing a shape.
 */
const ERROR_MESSAGES: Record<string, string> = {
  denied: "You cancelled the connection. Nothing was changed.",
  invalid_state: "That connection link expired. Please try again.",
  missing_code: "The service didn't return an authorization code. Try again.",
  exchange_failed: "We couldn't complete the connection. Please try again.",
  // The account linked fine; only the first playlist read failed. "Couldn't
  // connect" would send someone to reconnect what is already connected.
  import_failed: "Connected, but we couldn't import your playlists yet.",
  not_configured:
    "This service isn't configured yet. Add its API credentials to your environment.",
};

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { user, profile } = await requireProfile();

  const [connections, playlists] = await Promise.all([
    prisma.connectedAccount.findMany({
      where: { userId: user.id },
      select: { provider: true, lastSyncStatus: true },
    }),
    prisma.playlist.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, provider: true, coverImageUrl: true, visible: true },
    }),
  ]);

  const connected = new Set(connections.map((row) => row.provider));
  // Nothing connected and nothing pasted is the only state with no shelf to
  // manage, so it is the only one that still gets the invitation.
  const isFirstRun = connected.size === 0 && playlists.length === 0;
  const missing: MissingService[] = (Object.keys(PROVIDERS) as ConnectableProvider[])
    .filter((provider) => !connected.has(provider))
    .map((provider) => ({
      provider,
      slug: providerSlug(provider),
      label: provider === "SPOTIFY" ? "Spotify" : "YouTube",
    }));

  const searchParams = await props.searchParams;
  const rawError = searchParams.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  let errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null;

  // "We couldn't import your playlists" on its own sends people off to check a
  // login that already succeeded. syncProvider stored the provider's own reason
  // -- an allowlist, a Premium requirement, a revoked grant -- so say that.
  const rawProvider = searchParams.provider;
  const providerSlugParam = Array.isArray(rawProvider) ? rawProvider[0] : rawProvider;
  const failing = providerSlugParam
    ? connections.find((row) => providerSlug(row.provider) === providerSlugParam)
    : undefined;
  if (errorKey === "import_failed" && failing?.lastSyncStatus) {
    errorMessage = syncFailureHint(failing.lastSyncStatus);
  }
  const retryProvider =
    errorKey === "import_failed" && providerSlugParam
      ? {
          slug: providerSlugParam,
          label: providerSlugParam === "spotify" ? "Spotify" : "YouTube",
        }
      : null;

  // Set by the username claim and only by it. The moment strips the flag as it
  // opens, so a refresh lands on the plain screen.
  const rawWelcome = searchParams.welcome;
  const isNew =
    (Array.isArray(rawWelcome) ? rawWelcome[0] : rawWelcome) === "1";

  return (
    <div className="flex flex-1 flex-col bg-[#150e07]">
      {isNew && (
        <WelcomeMoment
          displayName={profile.displayName || profile.username}
          handle={profile.username}
        />
      )}

      {/* Drawn on a phone, so the column stops growing and centres. Only the
          invitation needs the gap -- the board's main is flex-1 with its own 36px. */}
      <div
        className={`mx-auto flex w-full max-w-[430px] flex-1 flex-col px-6 pt-8 pb-6 ${
          isFirstRun ? "justify-between gap-10" : ""
        }`}
      >
        <header className="flex w-full items-center justify-between gap-4">
          {/* The door to the public page. Drawn as identity rather than a link,
              so the affordance is held back to a hover. */}
          <Link
            href={`/${profile.username}`}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--panel-solid)]">
              {profile.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={profile.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-medium text-accent">
                  {profile.username.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="truncate text-sm font-medium text-white transition-colors group-hover:text-accent">
              {profile.username}
            </span>
          </Link>

          <SettingsMenu>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                type="submit"
                className="w-full cursor-pointer rounded-[8px] px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-[#c8c8c8] transition-colors hover:bg-surface-raised hover:text-white"
              >
                Sign out
              </button>
            </form>
          </SettingsMenu>
        </header>

        {isFirstRun ? (
          <main className="flex w-full flex-col items-center gap-9 pb-[66px]">
            <div className="flex w-full flex-col items-center gap-3 px-3 text-center">
              <h1 className="heading text-[20px] text-white">
                Connect to your music service
              </h1>
              <p className="text-sm text-[#c8c8c8]">
                Link Spotify or Youtube Music to import your playlists and start
                building your page
              </p>
            </div>

            {errorMessage && (
              <p role="alert" className="note note-error w-full">
                {errorMessage}
              </p>
            )}

            <div className="flex w-full flex-col items-center justify-center gap-3 px-6 py-4">
              {/* The two marks overlap by 11px, YouTube over Spotify -- they are
                  a picture of what a link can be, not two buttons any more. */}
              <span aria-hidden="true" className="relative block h-10 w-[68px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/Spotify_icon.svg"
                  alt=""
                  width={39}
                  height={40}
                  className="absolute top-0 left-0"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/YouTube_icon.svg"
                  alt=""
                  width={40}
                  height={40}
                  className="absolute top-0 left-[28px]"
                />
              </span>
              <p className="w-[243px] text-center text-sm text-[#c8c8c8]">
                Paste your Spotify or YouTube music link to import it.
              </p>
            </div>

            <PasteLinkForm />
          </main>
        ) : (
          <PlaylistBoard
            initial={playlists satisfies PlaylistRow[]}
            missing={missing}
            connectError={errorMessage}
            retryProvider={retryProvider}
          />
        )}

        {/* No padding of its own: pb-6 above is what puts the wordmark 24px off
            the bottom edge, and 4px here would quietly make it 28. */}
        <footer className="flex w-full items-center justify-center">
          <span className="wordmark text-white">SpindlShare</span>
        </footer>
      </div>
    </div>
  );
}
