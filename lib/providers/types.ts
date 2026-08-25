import type { MusicProvider } from "@/app/generated/prisma/enums";

/** A playlist normalized across providers, ready to upsert into the Playlist table. */
export type NormalizedPlaylist = {
  externalId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  externalUrl: string;
  trackCount: number | null;
};

/** The result of an OAuth code exchange or refresh. */
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

export type ProviderClient = {
  provider: MusicProvider;
  /**
   * Where to send the user to grant access. `forceApproval` makes the provider
   * show its account chooser instead of silently reusing the browser session.
   */
  getAuthorizationUrl(
    state: string,
    options?: { forceApproval?: boolean }
  ): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  fetchPlaylists(accessToken: string): Promise<NormalizedPlaylist[]>;
};

export class ProviderAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

/**
 * The provider rate-limited *us*. Spotify and YouTube apply their quotas per
 * application, not per end user, so one abusive account can exhaust the quota
 * for everyone -- worth surfacing distinctly rather than as a generic failure.
 */
export class ProviderRateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ProviderRateLimitError";
  }
}

/** Parses a Retry-After header, which may be seconds or an HTTP date. */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));

  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}
