import "server-only";

import {
  ProviderAuthError,
  ProviderRateLimitError,
  parseRetryAfter,
  type NormalizedPlaylist,
  type OAuthTokens,
  type ProviderClient,
} from "./types";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";

// There is no official YouTube *Music* API. This reads the user's YouTube
// playlists via the Data API -- which is where YouTube Music playlists live
// underneath -- so the UI says "YouTube playlists", not "YouTube Music".
const SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"];

const MAX_PAGES = 50;

function config() {
  // Deliberately the same Google OAuth client as app login, with a different
  // redirect URI and scope set, so we only manage one client in GCP.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "YouTube is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and YOUTUBE_REDIRECT_URI."
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function isYouTubeConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.YOUTUBE_REDIRECT_URI
  );
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

type YouTubePlaylistItem = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { itemCount?: number };
};

function pickThumbnail(snippet: YouTubePlaylistItem["snippet"]) {
  const thumbnails = snippet?.thumbnails;
  if (!thumbnails) return null;
  // Best available, degrading gracefully.
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const url = thumbnails[key]?.url;
    if (url) return url;
  }
  return null;
}

export const youtube: ProviderClient = {
  provider: "YOUTUBE",

  getAuthorizationUrl(state: string, options?: { forceApproval?: boolean }) {
    const { clientId, redirectUri } = config();
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
      state,
      // Both are required for Google to return a refresh token.
      access_type: "offline",
      // select_account adds Google's chooser, for picking a different account.
      prompt: options?.forceApproval ? "select_account consent" : "consent",
      include_granted_scopes: "true",
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  async exchangeCode(code: string) {
    const { clientId, clientSecret, redirectUri } = config();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ProviderAuthError(
        `Google token exchange failed: ${await response.text()}`,
        response.status
      );
    }
    return toTokens(await response.json());
  },

  async refreshAccessToken(refreshToken: string) {
    const { clientId, clientSecret } = config();
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new ProviderAuthError(
        `Google token refresh failed: ${await response.text()}`,
        response.status
      );
    }

    const tokens = toTokens(await response.json());
    // Google omits refresh_token on refresh -- keep the one we already have.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  },

  async fetchPlaylists(accessToken: string) {
    const playlists: NormalizedPlaylist[] = [];
    let pageToken: string | undefined;
    let page = 0;

    do {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        mine: "true",
        maxResults: "50",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(`${API_BASE}/playlists?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (response.status === 401) {
        throw new ProviderAuthError("YouTube access token expired.", 401);
      }
      // 403 is how the Data API reports quota exhaustion (quotaExceeded /
      // rateLimitExceeded), not just permission denial.
      if (response.status === 429 || response.status === 403) {
        const body = await response.text();
        if (response.status === 429 || /quota|rateLimit/i.test(body)) {
          throw new ProviderRateLimitError(
            "YouTube's daily quota is exhausted. Please try again later.",
            parseRetryAfter(response.headers.get("retry-after"))
          );
        }
        throw new ProviderAuthError(
          `YouTube playlist fetch failed: ${body}`,
          response.status
        );
      }
      if (!response.ok) {
        throw new ProviderAuthError(
          `YouTube playlist fetch failed: ${await response.text()}`,
          response.status
        );
      }

      const data: {
        items?: YouTubePlaylistItem[];
        nextPageToken?: string;
      } = await response.json();

      for (const item of data.items ?? []) {
        if (!item?.id) continue;
        playlists.push({
          externalId: item.id,
          title: item.snippet?.title || "Untitled playlist",
          description: item.snippet?.description || null,
          coverImageUrl: pickThumbnail(item.snippet),
          externalUrl: `https://www.youtube.com/playlist?list=${item.id}`,
          trackCount: item.contentDetails?.itemCount ?? null,
        });
      }

      pageToken = data.nextPageToken;
      page++;
    } while (pageToken && page < MAX_PAGES);

    return playlists;
  },
};
