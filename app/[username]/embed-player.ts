"use client";

/**
 * Mounts a provider's official player and reports whether it is actually playing.
 *
 * The embeds are opaque iframes, so "is a song playing right now" cannot be
 * inferred from the outside -- but both providers publish a control API that
 * says so. Spotify's Embed IFrame API emits `playback_update` carrying
 * `isPaused`; YouTube's IFrame Player API emits `onStateChange`. Without these
 * the record could only spin unconditionally, which claims sound that may not be
 * playing.
 *
 * Both APIs build the iframe themselves from a host element, so the caller
 * renders an empty container and this fills it.
 */

import type { MusicProvider } from "@/app/generated/prisma/enums";

type Controller = { destroy?: () => void };

type SpotifyController = {
  addListener: (
    event: "playback_update" | "ready",
    cb: (payload: { data: { isPaused: boolean } }) => void
  ) => void;
  destroy?: () => void;
};

type SpotifyIFrameApi = {
  createController: (
    element: HTMLElement,
    options: { uri: string; width: string | number; height: string | number },
    callback: (controller: SpotifyController) => void
  ) => void;
};

type YouTubePlayer = {
  destroy: () => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameApi) => void;
    onYouTubeIframeAPIReady?: () => void;
    YT?: {
      Player: new (
        el: HTMLElement,
        config: Record<string, unknown>
      ) => YouTubePlayer;
      PlayerState: { PLAYING: number };
    };
  }
}

/**
 * Each script is fetched at most once per document and shared by every player
 * after it, since both providers hang their readiness on a single global
 * callback that a second script tag would overwrite.
 */
let spotifyApi: Promise<SpotifyIFrameApi> | null = null;
let youtubeApi: Promise<NonNullable<Window["YT"]>> | null = null;

function injectScript(src: string) {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  document.body.appendChild(script);
}

function loadSpotifyApi(): Promise<SpotifyIFrameApi> {
  spotifyApi ??= new Promise((resolve) => {
    window.onSpotifyIframeApiReady = resolve;
    injectScript("https://open.spotify.com/embed/iframe-api/v1");
  });
  return spotifyApi;
}

function loadYouTubeApi(): Promise<NonNullable<Window["YT"]>> {
  youtubeApi ??= new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    injectScript("https://www.youtube.com/iframe_api");
  });
  return youtubeApi;
}

export type MountOptions = {
  provider: MusicProvider;
  externalId: string;
  container: HTMLElement;
  height: number;
  onPlayingChange: (playing: boolean) => void;
  /** Plain embed URL, used if the control API never arrives. */
  fallbackSrc: string;
};

/** How long to wait for a provider script before falling back to a bare iframe. */
const API_TIMEOUT_MS = 2500;

/**
 * Last resort when the control API is blocked, offline, or changes shape.
 *
 * Playback state is unknowable through a bare iframe, so the record stays still
 * -- but a still record beside a working player is a far better failure than an
 * empty box where the music should be. The previous implementation always used
 * this iframe; the control API is the upgrade, not the requirement.
 */
function mountFallback(container: HTMLElement, src: string, height: number) {
  if (container.childElementCount > 0) return;
  const frame = document.createElement("iframe");
  // Attached blank, then navigated with replace(): assigning .src pushes an
  // entry onto the joint session history, so Back would step through the
  // embeds a visitor opened instead of leaving the page.
  frame.src = "about:blank";
  frame.width = "100%";
  frame.height = String(height);
  frame.style.border = "0";
  frame.style.display = "block";
  frame.allow =
    "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
  container.appendChild(frame);
  frame.contentWindow?.location.replace(src);
}

/**
 * Returns a teardown function. Safe to call before the API has finished
 * loading -- a player that arrives after teardown is destroyed immediately
 * rather than left running behind a closed overlay.
 */
export function mountEmbedPlayer({
  provider,
  externalId,
  container,
  height,
  onPlayingChange,
  fallbackSrc,
}: MountOptions): () => void {
  let disposed = false;
  let controller: Controller | null = null;

  const adopt = (created: Controller) => {
    if (disposed) {
      created.destroy?.();
      return;
    }
    controller = created;
  };

  // If nothing has rendered a player by now, the script never arrived.
  const fallbackTimer = window.setTimeout(() => {
    if (!disposed) mountFallback(container, fallbackSrc, height);
  }, API_TIMEOUT_MS);

  if (provider === "SPOTIFY") {
    loadSpotifyApi()
      .then((api) => {
        if (disposed) return;
        api.createController(
          container,
          { uri: `spotify:playlist:${externalId}`, width: "100%", height },
          (created) => {
            created.addListener("playback_update", (payload) => {
              if (!disposed) onPlayingChange(!payload.data.isPaused);
            });
            adopt(created);
          }
        );
      })
      .catch(() => {
        if (!disposed) mountFallback(container, fallbackSrc, height);
      });
  } else if (provider === "YOUTUBE") {
    loadYouTubeApi()
      .then((YT) => {
        if (disposed) return;
        const player = new YT.Player(container, {
          height: String(height),
          width: "100%",
          playerVars: { list: externalId, listType: "playlist" },
          events: {
            onStateChange: (event: { data: number }) => {
              if (!disposed) onPlayingChange(event.data === YT.PlayerState.PLAYING);
            },
          },
        });
        adopt(player);
      })
      .catch(() => {
        if (!disposed) mountFallback(container, fallbackSrc, height);
      });
  }

  return () => {
    disposed = true;
    window.clearTimeout(fallbackTimer);
    onPlayingChange(false);
    try {
      controller?.destroy?.();
    } catch {
      // Destroying a player whose iframe has already gone is not a failure.
    }
    controller = null;
  };
}
