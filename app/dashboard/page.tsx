import Link from "next/link";

import { signOut } from "@/lib/auth";
import { requireProfile } from "@/lib/dal";
import { providerSlug, type ConnectableProvider } from "@/lib/providers";

import { WelcomeMoment } from "./welcome-moment";

/**
 * The first screen of the signed-in app: pick a music service to import from.
 * A whole viewport, so it carries its own header and wordmark rather than a shell's.
 */

type Service = {
  provider: ConnectableProvider;
  /** In public/, exported from the design at the size it is drawn. */
  icon: string;
  width: number;
  height: number;
  blurb: string;
};

const SERVICES: Service[] = [
  {
    provider: "SPOTIFY",
    icon: "/Spotify_icon.svg",
    width: 39,
    height: 40,
    blurb: "Import your playlists that you created or follow on Spotify.",
  },
  {
    provider: "YOUTUBE",
    icon: "/YouTube_icon.svg",
    width: 39,
    height: 27,
    // No YouTube Music API -- those playlists surface through the YouTube one.
    blurb: "Bring in your YouTube playlists, YouTube Music ones included.",
  },
];

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
  const { profile } = await requireProfile();

  const searchParams = await props.searchParams;
  const rawError = searchParams.error;
  const errorKey = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorKey ? ERROR_MESSAGES[errorKey] : null;

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

      {/* Drawn on a phone: wider than that the column centres rather than
          stretching the cards into letterboxes. */}
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-between gap-10 px-6 pt-8 pb-6">
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

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="cursor-pointer text-sm font-medium whitespace-nowrap text-[#c8c8c8] transition-colors hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="flex w-full flex-col gap-9">
          <div className="flex flex-col items-center gap-3 text-center text-white">
            {/* One line, on the column's full width: at 24px it needs ~330px of
                the 345 there are, so the paragraph's inset would cost the line. */}
            <h1 className="heading text-[clamp(18px,6vw,24px)]">
              Connect to your music service
            </h1>
            <p className="px-3 text-sm text-[#c8c8c8]">
              Link Spotify or Youtube Music to import your playlists and start
              building your page
            </p>
          </div>

          {errorMessage && (
            <p role="alert" className="note note-error">
              {errorMessage}
            </p>
          )}

          <div className="flex w-full flex-col gap-6">
            {SERVICES.map(({ provider, icon, width, height, blurb }) => (
              /* Straight to the OAuth route even unconfigured -- it redirects
                 back here saying so, rather than the card leading elsewhere. */
              <a
                key={provider}
                href={`/api/connect/${providerSlug(provider)}`}
                className="flex w-full items-center justify-center gap-6 overflow-hidden rounded-lg bg-[rgba(115,115,115,0.21)] p-6 transition-colors hover:bg-[rgba(115,115,115,0.3)]"
              >
                <span className="flex w-[39px] shrink-0 justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={icon} alt="" width={width} height={height} />
                </span>
                <span className="flex-1 text-sm text-[#c8c8c8]">{blurb}</span>
              </a>
            ))}

            {/* The third way in, for anything we can't authorize. Quieter than
                the cards because it is the fallback, not the invitation. */}
            <div className="flex w-full flex-col items-center gap-3 px-6 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Add_link_vector.svg" alt="" width={43} height={43} />
              <p className="w-[243px] text-center text-sm text-[#c8c8c8]">
                Paste public Spotify or YouTube music link to import it.
              </p>
            </div>
          </div>
        </main>

        {/* No padding of its own: pb-6 above is what puts the wordmark 24px off
            the bottom edge, and 4px here would quietly make it 28. */}
        <footer className="flex w-full items-center justify-center">
          <span className="wordmark text-white">SpindlShare</span>
        </footer>
      </div>
    </div>
  );
}
