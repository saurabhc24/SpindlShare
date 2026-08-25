import "server-only";

import {
  ProviderAuthError,
  ProviderRateLimitError,
  parseRetryAfter,
  type NormalizedPlaylist,
  type OAuthTokens,
  type ProviderClient,
} from "./types";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

// Read-only access to the user's own playlists. Nothing else is requested.
const SCOPES = ["playlist-read-private", "playlist-read-collaborative"];

// Guard against a pathological pagination loop; 50 pages x 50 items is far more
// playlists than any real account has.
const MAX_PAGES = 50;

function config() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Spotify is not configured. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET and SPOTIFY_REDIRECT_URI."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isSpotifyConfigured() {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
      process.env.SPOTIFY_CLIENT_SECRET &&
      process.env.SPOTIFY_REDIRECT_URI
  );
}

function basicAuthHeader() {
  const { clientId, clientSecret } = config();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function toTokens(payload: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}): OAuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null,
    scope: payload.scope ?? null,
  };
}

type SpotifyPlaylistItem = {
  id: string;
  name: string;
  description: string | null;
  images: { url: string }[] | null;
  external_urls: { spotify?: string };
  tracks: { total: number } | null;
};

export const spotify: ProviderClient = {
  provider: "SPOTIFY",

  getAuthorizationUrl(state: string, options?: { forceApproval?: boolean }) {
    const { clientId, redirectUri } = config();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      // `show_dialog` off by default. Setting it true forces the approval
      // screen even for a user who is already signed in to Spotify in this
      // browser and has already granted these scopes -- turning what should be
      // a silent round-trip into a form to click through on every reconnect.
      // Left off, that user is redirected straight back and the connect feels
      // instant. The cost is that switching to a different Spotify account now
      // means signing out of Spotify in the browser first, which is the rarer
      // case by far.
      //
      // Note this is as close to "log in with the app you're already using" as
      // the web gets: Spotify's app-switch authorization lives only in the iOS
      // and Android native SDKs, which a browser cannot invoke. What carries
      // over is the *browser's* Spotify session, not the desktop or phone app's.
    });
    // The exception: after a failed import, the browser's Spotify session is
    // the thing most likely to be wrong, so let the user pick another account.
    if (options?.forceApproval) params.set("show_dialog", "true");
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(code: string) {
    const { redirectUri } = config();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ProviderAuthError(
        `Spotify token exchange failed: ${await response.text()}`,
        response.status
      );
    }
    return toTokens(await response.json());
  },

  async refreshAccessToken(refreshToken: string) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ProviderAuthError(
        `Spotify token refresh failed: ${await response.text()}`,
        response.status
      );
    }

    const tokens = toTokens(await response.json());
    // Spotify usually omits refresh_token on refresh -- keep the existing one.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  },

  async fetchPlaylists(accessToken: string) {
    const playlists: NormalizedPlaylist[] = [];
    let url: string | null = `${API_BASE}/me/playlists?limit=50`;
    let page = 0;

    while (url && page < MAX_PAGES) {
      const response: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (response.status === 401) {
        throw new ProviderAuthError("Spotify access token expired.", 401);
      }
      if (response.status === 429) {
        // Spotify's quota is per-application, so continuing to hammer it would
        // degrade sync for every user. Stop and surface the wait.
        throw new ProviderRateLimitError(
          "Spotify is rate-limiting requests. Please try again shortly.",
          parseRetryAfter(response.headers.get("retry-after"))
        );
      }
      if (!response.ok) {
        throw new ProviderAuthError(
          `Spotify playlist fetch failed: ${await response.text()}`,
          response.status
        );
      }

      const data: { items: SpotifyPlaylistItem[] | null; next: string | null } =
        await response.json();

      for (const item of data.items ?? []) {
        // Spotify can return null entries for playlists that became unavailable.
        if (!item?.id) continue;
        playlists.push({
          externalId: item.id,
          title: item.name || "Untitled playlist",
          description: item.description || null,
          coverImageUrl: item.images?.[0]?.url ?? null,
          externalUrl:
            item.external_urls?.spotify ??
            `https://open.spotify.com/playlist/${item.id}`,
          trackCount: item.tracks?.total ?? null,
        });
      }

      url = data.next;
      page++;
    }

    return playlists;
  },
};
