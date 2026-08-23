"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { playlistEmbed } from "@/lib/playlist-embed";
import { isYouTubeMusic } from "@/lib/playlist-link";

import { mountEmbedPlayer } from "./embed-player";
import type { ShowcaseItem } from "./showcase";

/**
 * The slide-up detail view: a turntable, and the provider's own player beneath it.
 *
 * The design's per-track list is not built, because the data behind it does not
 * exist for Spotify -- /v1/playlists/{id}/tracks answers 403 under an app token
 * and the playlist response nulls its `tracks` field. The embed carries the real
 * track list and the real controls, and is the only thing here that makes sound.
 */

/**
 * Deck geometry, in one place because every circle below is derived from it.
 *
 * The container is exactly the deck's size: it used to be shorter, so the deck
 * overflowed by ~30px and sat on top of the playlist title. Sizes are modest --
 * an earlier, larger deck left the embed with almost no room on a phone, which
 * is the part people came for.
 */
const DECK = 208;
const VINYL = Math.round(DECK * 0.9);
const LABEL = Math.round(DECK * 0.37);

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
  const embed = item ? playlistEmbed(item.provider, item.externalId) : null;
  const open = Boolean(item);

  const handlePlayingChange = useCallback((next: boolean) => {
    setPlaying(next);
  }, []);

  // The player is built only once the overlay is genuinely open. Mounting it
  // with the page would hand every visitor's address and cookies to Spotify or
  // Google before they asked for anything.
  useEffect(() => {
    const host = hostRef.current;
    if (!item || !embed || !host) return;

    const teardown = mountEmbedPlayer({
      provider: item.provider,
      externalId: item.externalId,
      container: host,
      height: embed.height,
      onPlayingChange: handlePlayingChange,
      fallbackSrc: embed.src,
    });

    return () => {
      teardown();
      // The provider replaced the host with its own iframe; clear it so the
      // next playlist starts from an empty container rather than two players.
      host.replaceChildren();
    };
  }, [item, embed, handlePlayingChange]);

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
        zIndex: 10,
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
                width: 34,
                height: 34,
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
                  width: 24,
                  height: 24,
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
                  right: 9,
                  top: 18,
                  width: 5,
                  height: DECK * 0.5,
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
                    bottom: -7,
                    width: 12,
                    height: 17,
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

        <div style={{ textAlign: "center", marginTop: 10, padding: "0 20px" }}>
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

      {/* THE PLAYER */}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "12px 12px 14px",
          minHeight: 0,
        }}
      >
        {embed ? (
          <>
            {/* Matching YouTube's own 16:9 removes the bars we were adding
                around the bars it already draws, so an art track's sleeve fills
                the frame instead of floating in a letterbox. Spotify's player is
                a list, so it keeps a fixed height. */}
            <div
              className="embed-frame"
              style={
                embed.aspectRatio
                  ? { aspectRatio: embed.aspectRatio, width: "100%" }
                  : { minHeight: embed.height }
              }
            >
              {/* The provider's API replaces this with its own iframe. */}
              <div
                ref={hostRef}
                style={{ width: "100%", height: embed.aspectRatio ? "100%" : undefined }}
              />
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
            {item && isYouTubeMusic(item.externalUrl) && (
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
        ) : (
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
      </div>
    </div>
  );
}
