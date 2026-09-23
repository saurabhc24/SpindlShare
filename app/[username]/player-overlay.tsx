"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playlistEmbed } from "@/lib/playlist-embed";
import { isYouTubeMusic } from "@/lib/playlist-link";

import { mountEmbedPlayer, type EmbedControl } from "./embed-player";
import type { ShowcaseItem } from "./playlist-item";

/**
 * The slide-up detail view: a turntable, the provider's own player, and the songs.
 *
 * The player is the provider's embed because it is the only thing here that can
 * make sound. The song list beside it is ours, captured at the owner's sync --
 * a visitor holds no provider token, so it cannot be read live.
 */

/** mm:ss. Providers report milliseconds; nobody wants to read those. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Deck geometry, in one place because every circle below is derived from it.
 *
 * The container is exactly the deck's size: it used to be shorter, so the deck
 * overflowed by ~30px and sat on top of the playlist title. Kept small on
 * purpose -- the songs are what this page is for, and at 208 the deck and the
 * player between them left room for about four rows on a phone.
 */
const DECK = 150;
const VINYL = Math.round(DECK * 0.9);
const LABEL = Math.round(DECK * 0.37);
/** The tonearm's pivot. Derived too, or it overhangs a smaller deck. */
const PIVOT = Math.round(DECK * 0.163);

export function PlayerOverlay({
  item,
  gradient,
  dotColor,
  onClose,
}: {
  item: ShowcaseItem | null;
  gradient: string;
  dotColor: string;
  onClose: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const open = Boolean(item);
  // Stable across renders, so the play callback is not rebuilt every time.
  const tracks = useMemo(() => item?.tracks ?? [], [item]);

  // Our own player, where the songs carry previews. The provider's embed only
  // plays for a visitor with its own session open, which most visitors do not
  // have -- so on this page it mostly sits there doing nothing.
  const playable = tracks.some((track) => track.previewUrl);
  // Memoised: a fresh object each render re-ran the mount effect and tore the player down.
  const embed = useMemo(
    () => (item && !playable ? playlistEmbed(item.provider, item.externalId) : null),
    [item, playable]
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<Set<number>>(() => new Set());

  // A preview must never outlive the card that started it. Reset during
  // render, the way React prescribes for state derived from a prop, and stop
  // the element itself in an effect, since that is the external system.
  const [lastItemId, setLastItemId] = useState(item?.id ?? null);
  if (lastItemId !== (item?.id ?? null)) {
    setLastItemId(item?.id ?? null);
    setCurrent(null);
    setPlaying(false);
    setBlocked(new Set());
  }

  // YouTube has no previews, so its rows drive the embed. The refs let the
  // player's long-lived callbacks read the list without remounting it.
  const controlRef = useRef<EmbedControl | null>(null);
  const drivenRef = useRef(false);
  const tracksRef = useRef(tracks);
  const currentRef = useRef(current);
  useEffect(() => {
    tracksRef.current = tracks;
    currentRef.current = current;
  }, [tracks, current]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    };
  }, [item?.id]);

  const playTrack = useCallback(
    (position: number) => {
      const track = tracks.find((t) => t.position === position);
      if (track?.videoId) {
        const control = controlRef.current;
        // No player to drive, or one that refuses this video: YouTube itself still plays it.
        if (!control || blocked.has(position)) {
          window.open(`https://www.youtube.com/watch?v=${track.videoId}`, "_blank", "noopener");
          return;
        }
        if (current === position) {
          if (playing) control.pause();
          else control.resume();
          return;
        }
        drivenRef.current = true;
        setCurrent(position);
        control.play(track.videoId);
        return;
      }

      const audio = audioRef.current;
      if (!audio || !track?.previewUrl) return;

      // A second tap on the playing row is a pause, which is what a row that
      // shows a pause icon has to do.
      if (current === position && !audio.paused) {
        audio.pause();
        return;
      }
      if (current !== position) {
        audio.src = track.previewUrl;
        setCurrent(position);
      }
      // Autoplay can still be refused; the catch keeps the row honest.
      audio.play().catch(() => {
        setPlaying(false);
      });
    },
    [blocked, current, playing, tracks]
  );

  const handleControl = useCallback((control: EmbedControl | null) => {
    controlRef.current = control;
  }, []);

  // Also follows YouTube's own playlist, so the row that is playing is marked either way.
  const handleVideoChange = useCallback((videoId: string) => {
    const track = tracksRef.current.find((t) => t.videoId === videoId);
    setCurrent(track ? track.position : null);
  }, []);

  // Once a row has taken over, the player holds one video, so advancing is ours to do.
  const handleVideoEnd = useCallback((reason: "ended" | "error") => {
    const from = currentRef.current;
    if (!drivenRef.current || from === null) return;
    if (reason === "error") setBlocked((prev) => new Set(prev).add(from));
    const next = tracksRef.current.find((t) => t.position > from && t.videoId);
    if (next?.videoId && controlRef.current) {
      setCurrent(next.position);
      controlRef.current.play(next.videoId);
    }
  }, []);

  const handlePlayingChange = useCallback((next: boolean) => {
    setPlaying(next);
  }, []);

  // The player is built only once the overlay is genuinely open. Mounting it
  // with the page would hand every visitor's address and cookies to Spotify or
  // Google before they asked for anything.
  useEffect(() => {
    const host = hostRef.current;
    if (!item || !embed || !host) return;

    // The provider's script replaces whatever node it is given. React must not
    // be that node's owner: it would later try to remove children that are no
    // longer its own, which throws NotFoundError and takes the page down with
    // an error boundary. So the script gets a plain div React never renders.
    const mount = document.createElement("div");
    host.appendChild(mount);
    // Opened on a song of ours, the player holds one video, so advancing is ours from the start.
    const firstVideoId = tracks.find((t) => t.videoId)?.videoId ?? undefined;
    drivenRef.current = Boolean(firstVideoId);

    const teardown = mountEmbedPlayer({
      provider: item.provider,
      externalId: item.externalId,
      container: mount,
      height: embed.height,
      onPlayingChange: handlePlayingChange,
      fallbackSrc: embed.src,
      videoId: firstVideoId,
      onControl: handleControl,
      onVideoChange: handleVideoChange,
      onVideoEnd: handleVideoEnd,
    });

    return () => {
      teardown();
      // Removing our own node, not React's: whatever the provider did inside it
      // goes with it, and the next playlist starts from an empty host.
      mount.remove();
    };
  }, [item, embed, tracks, handlePlayingChange, handleControl, handleVideoChange, handleVideoEnd]);

  useEffect(() => {
    if (!item) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label={item ? `${item.title} player` : undefined}
      style={{
        position: "absolute",
        inset: 0,
        // Above the profile chrome, which sits at 2000: this is a modal over the
        // whole page, and at 10 the header, bio and footer printed through it.
        zIndex: 3000,
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(120% 70% at 50% 4%, oklch(0.22 0.02 70) 0%, oklch(0.14 0.015 65) 34%, oklch(0.08 0.01 60) 70%, #050403 100%)",
        transform: open ? "translateY(0%)" : "translateY(100%)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition:
          "transform 0.55s cubic-bezier(0.22, 0.72, 0.16, 1), opacity 0.4s",
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 4px",
        }}
      >
        <button type="button" onClick={onClose} className="btn-ghost !py-2 !px-4">
          <span style={{ fontSize: 15, lineHeight: 1 }}>&lsaquo;</span> Back
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--ink-dim)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}`,
            }}
          />
          {item?.providerLabel}
        </div>
      </div>

      {/* TURNTABLE */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "2px 0 0",
        }}
      >
        <div style={{ perspective: 900, perspectiveOrigin: "50% 40%" }}>
          {/* Exactly deck-sized, so nothing spills onto the title below. */}
          <div
            style={{
              position: "relative",
              width: DECK,
              height: DECK,
              transform: "rotateX(20deg)",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle at 42% 34%, oklch(0.34 0.008 250), oklch(0.19 0.006 250) 70%)",
                boxShadow:
                  "0 24px 48px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.08), inset 0 -8px 20px rgba(0,0,0,0.5)",
              }}
            />

            {/* Spins only while the provider reports playback. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: VINYL,
                height: VINYL,
                marginLeft: -VINYL / 2,
                marginTop: -VINYL / 2,
                borderRadius: "50%",
                background:
                  "repeating-radial-gradient(circle at 50% 50%, #0c0c0e 0 1.6px, #17171b 1.6px 3.2px)",
                boxShadow:
                  "0 8px 22px rgba(0,0,0,0.55), inset 0 0 40px rgba(0,0,0,0.6)",
                animation: "shelfSpin 2.4s linear infinite",
                animationPlayState: playing ? "running" : "paused",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.14) 24deg, transparent 60deg, transparent 200deg, rgba(255,255,255,0.08) 224deg, transparent 260deg)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: LABEL,
                  height: LABEL,
                  marginLeft: -LABEL / 2,
                  marginTop: -LABEL / 2,
                  borderRadius: "50%",
                  overflow: "hidden",
                  background: gradient,
                  boxShadow:
                    "inset 0 0 0 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.4)",
                }}
              >
                {item?.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.coverImageUrl}
                    alt=""
                    width={LABEL}
                    height={LABEL}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    className="heading"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: LABEL * 0.45,
                      color: "var(--ink)",
                    }}
                  >
                    {item?.title.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 8,
                  height: 8,
                  marginLeft: -4,
                  marginTop: -4,
                  borderRadius: "50%",
                  background: "#050505",
                  boxShadow: "0 0 0 2px rgba(255,255,255,0.15)",
                }}
              />
            </div>

            {/* Tonearm rests off the record until something is playing. */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 2,
                top: 2,
                width: PIVOT,
                height: PIVOT,
                transformOrigin: "82% 18%",
                transform: `rotate(${playing ? 24 : 2}deg)`,
                transition: "transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  width: Math.round(PIVOT * 0.7),
                  height: Math.round(PIVOT * 0.7),
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 38% 32%, oklch(0.5 0.008 250), oklch(0.26 0.006 250))",
                  boxShadow:
                    "0 3px 8px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: Math.round(PIVOT * 0.26),
                  top: Math.round(PIVOT * 0.53),
                  width: 5,
                  height: DECK * 0.46,
                  borderRadius: 4,
                  transform: "rotate(26deg)",
                  transformOrigin: "top center",
                  background:
                    "linear-gradient(to bottom, oklch(0.62 0.006 250), oklch(0.42 0.006 250))",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -4,
                    bottom: -6,
                    width: 11,
                    height: 15,
                    borderRadius: 3,
                    background:
                      "linear-gradient(to bottom, oklch(0.5 0.006 250), oklch(0.3 0.006 250))",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, padding: "0 20px" }}>
          {item?.trackCount !== null && item?.trackCount !== undefined && (
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "1px",
                color: "var(--accent)",
                opacity: 0.75,
                marginBottom: 2,
              }}
            >
              {item.trackCount} TRACKS
            </div>
          )}
          <div className="heading" style={{ fontSize: 26, lineHeight: 1.05 }}>
            {item?.title}
          </div>
        </div>
      </div>

      {/* THE PLAYER, THEN THE SONGS */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          padding: "16px 16px 0",
          minHeight: 0,
        }}
      >
        {/* Ours, where the songs carry previews. Hidden: the rows are the
            controls, so a second set of transport buttons would be noise. */}
        {playable && (
          <audio
            ref={audioRef}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              // Straight into the next playable song, the way a playlist runs.
              const next = tracks.find(
                (t) => t.position > (current ?? -1) && t.previewUrl
              );
              if (next) playTrack(next.position);
              else {
                setPlaying(false);
                setCurrent(null);
              }
            }}
          />
        )}

        {playable && item && (
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 14,
              background: "var(--panel-solid)",
              border: "1px solid var(--line)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                const first = tracks.find((t) => t.previewUrl);
                if (current !== null) playTrack(current);
                else if (first) playTrack(first.position);
              }}
              aria-label={playing ? "Pause" : "Play"}
              style={{
                flex: "0 0 auto",
                width: 42,
                height: 42,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--gold)",
                color: "#151210",
              }}
            >
              {playing ? (
                <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
                  <rect x="0" y="0" width="4.5" height="15" rx="1.4" fill="currentColor" />
                  <rect x="8.5" y="0" width="4.5" height="15" rx="1.4" fill="currentColor" />
                </svg>
              ) : (
                <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
                  <path d="M0 1.1v12.8a1.1 1.1 0 0 0 1.7 1l10.8-6.4a1.1 1.1 0 0 0 0-1.9L1.7.1A1.1 1.1 0 0 0 0 1.1Z" fill="currentColor" />
                </svg>
              )}
            </button>

            <span style={{ flex: "1 1 auto", minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {current !== null
                  ? tracks.find((t) => t.position === current)?.title
                  : "Tap a song to play"}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 2,
                  fontSize: 11,
                  color: "var(--ink-faint)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {current !== null
                  ? tracks.find((t) => t.position === current)?.artist
                  : "30-second previews"}
              </span>
            </span>

            {/* The full track lives at the provider; this is a preview. */}
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: "0 0 auto",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              Full tracks
            </a>
          </div>
        )}

        {embed ? (
          <>
            {/* Matching YouTube's own 16:9 removes the bars we were adding
                around the bars it already draws, so an art track's sleeve fills
                the frame instead of floating in a letterbox. Spotify's player is
                a control bar, so it keeps a fixed height. */}
            <div
              className="embed-frame"
              style={
                embed.aspectRatio
                  ? { aspectRatio: embed.aspectRatio, width: "100%", flex: "0 0 auto" }
                  : { height: embed.height, flex: "0 0 auto" }
              }
            >
              {/* The provider's API replaces this with its own iframe. Given a
                  height rather than left to size itself: the Spotify branch used
                  to set only the frame's minHeight, leaving a blank band under
                  a player that renders shorter than the frame. */}
              <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
            </div>
            <p
              style={{
                margin: "8px 4px 0",
                fontSize: 11,
                textAlign: "center",
                color: "var(--ink-faint)",
              }}
            >
              {embed.note}
            </p>
            {/* YouTube Music has no embed of its own, so the player above is
                regular YouTube -- which omits Music's art tracks and can show
                far fewer songs than the playlist holds. Saying so, and offering
                the surface that has them all, beats silently under-representing
                someone's playlist. */}
            {item && tracks.length === 0 && isYouTubeMusic(item.externalUrl) && (
              <p
                style={{
                  margin: "6px 4px 0",
                  fontSize: 11,
                  textAlign: "center",
                  color: "var(--ink-faint)",
                }}
              >
                Some YouTube Music tracks only play there.{" "}
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", fontWeight: 600 }}
                >
                  Open in YouTube Music
                </a>
              </p>
            )}
          </>
        ) : playable ? null : (
          // Nothing to play at all: no embed, and no previews either.
          <div style={{ textAlign: "center", paddingBottom: 8 }}>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--ink-faint)",
                marginBottom: 14,
              }}
            >
              {item?.providerLabel} doesn&apos;t offer an embedded player.
            </p>
            {item && (
              <a
                href={item.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-gold"
              >
                Open in {item.providerLabel}
              </a>
            )}
          </div>
        )}

        {/* Nothing stored yet -- the owner has not synced since songs started
            being kept. Said plainly, rather than leaving the space blank. */}
        {item && tracks.length === 0 && (
          <p
            style={{
              margin: "18px 4px 0",
              fontSize: 11.5,
              textAlign: "center",
              color: "var(--ink-faint)",
            }}
          >
            The song list appears once this playlist is synced again.
          </p>
        )}

        {/* THE SONGS. The only scrolling region: the turntable and the player
            hold their place while this runs under them. */}
        {item && tracks.length > 0 && (
          <ol
            aria-label={`Songs in ${item.title}`}
            style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              overscrollBehavior: "contain",
              listStyle: "none",
              margin: "12px 0 0",
              padding: "0 0 16px",
              // Hairline above the first row, so the list reads as a section
              // rather than as text loose under the player.
              borderTop: "1px solid var(--line)",
            }}
          >
            {tracks.map((track) => {
              const isCurrent = current === track.position;
              const canPlay = Boolean(track.previewUrl || track.videoId);
              return (
              <li
                key={track.position}
                onClick={canPlay ? () => playTrack(track.position) : undefined}
                aria-current={isCurrent}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "9px 0",
                  borderBottom: "1px solid oklch(0.3 0.01 66 / 0.35)",
                  cursor: canPlay ? "pointer" : "default",
                }}
              >
                {/* The number doubles as the play control: it turns into a
                    pause while this row is the one making sound. */}
                <span
                  style={{
                    flex: "0 0 auto",
                    width: 22,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    color: isCurrent ? "var(--accent)" : "var(--ink-faint)",
                  }}
                >
                  {isCurrent && playing ? (
                    <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">
                      <rect x="0" y="0" width="3" height="11" rx="1" fill="currentColor" />
                      <rect x="6" y="0" width="3" height="11" rx="1" fill="currentColor" />
                    </svg>
                  ) : isCurrent ? (
                    <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">
                      <path d="M0 0.8v9.4a.8.8 0 0 0 1.2.7l8-4.7a.8.8 0 0 0 0-1.4l-8-4.7A.8.8 0 0 0 0 .8Z" fill="currentColor" />
                    </svg>
                  ) : (
                    track.position + 1
                  )}
                </span>
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {track.title}
                  </span>
                  {track.artist && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 1,
                        fontSize: 11.5,
                        color: "var(--ink-dim)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {track.artist}
                    </span>
                  )}
                </span>
                {/* Absent where the provider gives no duration, rather than
                    showing a dash. */}
                {track.durationMs != null && (
                  <span
                    style={{
                      flex: "0 0 auto",
                      fontSize: 11.5,
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--ink-faint)",
                    }}
                  >
                    {formatDuration(track.durationMs)}
                  </span>
                )}
              </li>
              );
            })}

            {/* The page carries at most PUBLIC_TRACK_LIMIT songs, so a longer
                playlist says so instead of appearing to end early. */}
            {item.trackCount != null && item.trackCount > tracks.length && (
              <li
                style={{
                  padding: "12px 4px 0",
                  fontSize: 11.5,
                  textAlign: "center",
                  color: "var(--ink-faint)",
                }}
              >
                Showing {tracks.length} of {item.trackCount}.{" "}
                <a
                  href={item.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", fontWeight: 600 }}
                >
                  See them all
                </a>
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
