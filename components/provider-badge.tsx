import type { MusicProvider } from "@/app/generated/prisma/enums";

const PROVIDER_LABELS: Record<MusicProvider, string> = {
  SPOTIFY: "Spotify",
  YOUTUBE: "YouTube",
  // Nothing produces AMAZON any more -- the value survives only because a
  // Postgres enum value cannot be dropped without recreating the type. It
  // reads as an ordinary link, like anything else with no integration.
  AMAZON: "Playlist",
  // Anything added by link that isn't one of the named services. Labelled by
  // what it is to the reader rather than by the enum's name.
  OTHER: "Playlist",
};

export function providerLabel(provider: MusicProvider) {
  return PROVIDER_LABELS[provider];
}

export function ProviderIcon({
  provider,
  className = "h-4 w-4",
  style,
}: {
  provider: MusicProvider;
  className?: string;
  /** The marks paint with currentColor, so this is how a caller brands them. */
  style?: React.CSSProperties;
}) {
  if (provider === "SPOTIFY") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={style}
      >
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.10-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.30c-.30.42-.84.60-1.26.30-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.60-.12-.48.12-1.02.60-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.24 1.20zm.12-3.36C15.24 8.46 8.82 8.22 5.16 9.36c-.60.18-1.20-.18-1.38-.72-.18-.60.18-1.20.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.30.72 1.02.42 1.56-.30.42-1.02.60-1.56.24z" />
      </svg>
    );
  }

  if (provider === "YOUTUBE") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={style}
      >
        <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.08 0 12 0 12s0 3.92.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
      </svg>
    );
  }

  // Anything else -- OTHER, and the retired AMAZON -- gets a generic music note,
  // since we have no idea what service is behind the link.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
    >
      <path d="M20.5 3.2a1 1 0 0 0-.86-.2l-10 2.3a1 1 0 0 0-.78.98v8.4a3.6 3.6 0 1 0 2 3.22V9.1l8-1.84v5.02a3.6 3.6 0 1 0 2 3.22V4a1 1 0 0 0-.36-.8z" />
    </svg>
  );
}
