"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MusicProvider } from "@/app/generated/prisma/enums";

import { PlayerOverlay } from "./player-overlay";

export type ShowcaseItem = {
  id: string;
  title: string;
  provider: MusicProvider;
  providerLabel: string;
  coverImageUrl: string | null;
  trackCount: number | null;
  externalUrl: string;
  /** Needed to build the embed URL; never rendered. */
  externalId: string;
};

export type Shelf = {
  name: string;
  items: ShowcaseItem[];
};

export type ShowcaseProps = {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  shelves: Shelf[];
  totalCount: number;
  shareUrl: string;
  shareDisplay: string;
};

/** Brand dots. OTHER has no brand, so it gets the scene's own accent. */
const PROVIDER_DOT: Record<MusicProvider, string> = {
  SPOTIFY: "#1ed760",
  YOUTUBE: "#ff3d3d",
  AMAZON: "oklch(0.86 0.08 82)",
  OTHER: "oklch(0.86 0.08 82)",
};

/**
 * A stable hue per playlist, so a cover without artwork still looks deliberate
 * and, more importantly, looks the *same* on every visit. Deriving it from the
 * title rather than the index means adding a playlist doesn't recolour the rest.
 */
function hueFromTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % 360;
  }
  return hash;
}

function coverGradient(title: string): string {
  const hue = hueFromTitle(title);
  return `linear-gradient(150deg, oklch(0.62 0.16 ${hue}), oklch(0.42 0.13 ${(hue + 40) % 360}))`;
}

export function Showcase({
  displayName,
  handle,
  avatarUrl,
  bio,
  shelves,
  totalCount,
  shareUrl,
  shareDisplay,
}: ShowcaseProps) {
  const [active, setActive] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // The playlist whose player is open. "No redirects": tapping a cover brings the
  // player here rather than handing the visitor to the provider's site.
  const [playing, setPlaying] = useState<ShowcaseItem | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cabinetRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  /**
   * Fits the cabinet to the stage: the whole rack when nothing is selected, the
   * chosen shelf's row when one is. Measured rather than hardcoded because the
   * shelf height depends on how many playlists it holds and on the fonts, which
   * settle after first paint.
   */
  const apply = useCallback((selected: number | null) => {
    const cabinet = cabinetRef.current;
    const stage = stageRef.current;
    if (!cabinet || !stage) return;

    // Measure untransformed, or every fit would compound the previous one.
    cabinet.style.transition = "none";
    cabinet.style.transform = "none";
    void cabinet.getBoundingClientRect();

    const stageRect = stage.getBoundingClientRect();
    const cabinetRect = cabinet.getBoundingClientRect();
    if (!cabinetRect.width || !cabinetRect.height) return;

    const origin = {
      x: cabinetRect.left + cabinetRect.width / 2,
      y: cabinetRect.top + cabinetRect.height / 2,
    };
    const stageCentre = {
      x: stageRect.left + stageRect.width / 2,
      y: stageRect.top + stageRect.height / 2,
    };

    let scale: number;
    let target: { x: number; y: number };

    if (selected === null) {
      scale = Math.min(
        (stageRect.width * 0.86) / cabinetRect.width,
        (stageRect.height * 0.9) / cabinetRect.height
      );
      target = origin;
    } else {
      const row = rowRefs.current[selected];
      const rowRect = row ? row.getBoundingClientRect() : cabinetRect;
      scale = Math.min(
        (stageRect.width * 0.98) / rowRect.width,
        (stageRect.height * 0.74) / rowRect.height
      );
      target = {
        x: rowRect.left + rowRect.width / 2,
        y: rowRect.top + rowRect.height / 2,
      };
    }

    const tx = stageCentre.x - origin.x - scale * (target.x - origin.x);
    const ty = stageCentre.y - origin.y - scale * (target.y - origin.y);
    cabinet.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;

    requestAnimationFrame(() => {
      cabinet.style.transition =
        "transform 1.15s cubic-bezier(0.22, 0.72, 0.16, 1)";
    });
  }, []);

  useEffect(() => {
    apply(active);
  }, [active, apply]);

  useEffect(() => {
    const onResize = () => apply(active);
    window.addEventListener("resize", onResize);

    // Fonts land after first paint and change the measured height, so refit.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) apply(active);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, [active, apply]);

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked without a secure context or permission; the URL is
      // printed in the footer regardless, so there is nothing to recover from.
    }
  }

  return (
    <div
      data-shelf-scene
      className="flex w-full justify-center"
      style={{ background: "#060504" }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 460,
          height: "100dvh",
          overflow: "hidden",
          background:
            "radial-gradient(120% 80% at 50% -6%, oklch(0.24 0.02 70) 0%, oklch(0.16 0.015 65) 32%, oklch(0.09 0.01 60) 66%, #060504 100%)",
          fontFamily: "var(--font-manrope), sans-serif",
          color: "var(--ink-dim)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(58% 34% at 50% 10%, oklch(0.9 0.08 85 / 0.13), transparent 62%)",
            animation: "shelfPulse 7s ease-in-out infinite",
          }}
        />

        {/* PROFILE */}
        <header
          style={{
            position: "relative",
            zIndex: 4,
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "20px 20px 16px",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              position: "relative",
              width: 56,
              height: 56,
              borderRadius: "50%",
              flex: "0 0 auto",
              background:
                "conic-gradient(from 210deg, oklch(0.9 0.07 85), oklch(0.72 0.09 70), oklch(0.95 0.05 90), oklch(0.8 0.09 80))",
              padding: 2,
              boxShadow: "0 0 26px oklch(0.85 0.09 82 / 0.3)",
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
                position: "relative",
              }}
            >
              {avatarUrl ? (
                // Avatars come from arbitrary provider CDNs, so a plain <img>
                // avoids allowlisting every remote host in next.config.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  width={56}
                  height={56}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "repeating-linear-gradient(45deg, transparent 0 6px, oklch(0.5 0.02 70 / 0.16) 6px 7px)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-instrument-serif), serif",
                      fontSize: 26,
                      color: "var(--ink)",
                      position: "relative",
                    }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontFamily: "var(--font-ubuntu), system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 27,
                lineHeight: 1,
                margin: "0 0 3px",
                color: "var(--ink)",
                letterSpacing: "0.3px",
              }}
            >
              {displayName}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                color: "var(--ink-dim)",
              }}
            >
              <span style={{ color: "var(--accent)" }}>{handle}</span>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: "50%",
                  background: "oklch(0.6 0.02 80)",
                }}
              />
              <span>
                {totalCount} {totalCount === 1 ? "collection" : "collections"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={share}
            style={{
              flex: "0 0 auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "10px 15px",
              border: "none",
              cursor: "pointer",
              borderRadius: 100,
              fontFamily: "var(--font-manrope), sans-serif",
              fontWeight: 700,
              fontSize: 12.5,
              color: "#151210",
              background:
                "linear-gradient(180deg, oklch(0.92 0.07 86), oklch(0.82 0.09 80))",
              boxShadow:
                "0 8px 20px oklch(0.75 0.09 78 / 0.35), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#151210",
              }}
            />
            {copied ? "Copied" : "Share"}
          </button>
        </header>

        {bio && (
          <p
            style={{
              position: "relative",
              zIndex: 4,
              margin: "-6px 20px 4px",
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--ink-dim)",
              flex: "0 0 auto",
            }}
          >
            {bio}
          </p>
        )}

        {/* STAGE */}
        <div
          ref={stageRef}
          style={{ position: "relative", flex: "1 1 auto", overflow: "hidden" }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 0,
              right: 0,
              zIndex: 6,
              display: "flex",
              justifyContent: "center",
              pointerEvents: "none",
              opacity: active === null ? 1 : 0,
              transition: "opacity 0.5s",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                borderRadius: 100,
                background: "oklch(0.2 0.015 68 / 0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
                backdropFilter: "blur(8px)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ink-dim)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "oklch(0.9 0.08 85)",
                  boxShadow: "0 0 8px oklch(0.9 0.08 85)",
                }}
              />
              {shelves.length > 1 ? "Tap a shelf to explore" : "Tap to explore"}
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              top: 12,
              left: 14,
              zIndex: 6,
              opacity: active === null ? 0 : 1,
              pointerEvents: active === null ? "none" : "auto",
              transition: "opacity 0.5s",
            }}
          >
            <button
              type="button"
              onClick={() => setActive(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 15px 9px 12px",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                borderRadius: 100,
                background: "oklch(0.2 0.015 68 / 0.72)",
                backdropFilter: "blur(8px)",
                fontFamily: "var(--font-manrope), sans-serif",
                fontWeight: 700,
                fontSize: 12.5,
                color: "var(--ink-dim)",
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>&lsaquo;</span> All
              shelves
            </button>
          </div>

          <div
            aria-hidden={active === null}
            style={{
              position: "absolute",
              top: 12,
              right: 16,
              zIndex: 6,
              opacity: active === null ? 0 : 1,
              transition: "opacity 0.5s",
              textAlign: "right",
              fontFamily: "var(--font-ubuntu), system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1,
              color: "var(--ink)",
              pointerEvents: "none",
            }}
          >
            {active === null ? "" : shelves[active].name}
          </div>

          {/* CABINET */}
          <div
            ref={cabinetRef}
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              marginLeft: -380,
              width: 760,
              transformOrigin: "50% 50%",
              willChange: "transform",
              padding: "30px 0",
            }}
          >
            {shelves.map((shelf, index) => {
              const focused = active === index;
              const dimmed = active !== null && !focused;

              return (
                <div
                  key={`${shelf.name}-${index}`}
                  style={{
                    position: "relative",
                    marginBottom: 44,
                    opacity: dimmed ? 0.12 : 1,
                    filter: dimmed ? "blur(3px)" : "blur(0px)",
                    transition: "opacity 0.9s ease, filter 0.9s ease",
                  }}
                >
                  {/* Overlay rather than wrapping the row in a button: the row
                      contains links, and a button may not contain a link. It
                      also disappears once focused, handing pointer and keyboard
                      focus to the playlists themselves. */}
                  {!focused && (
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      aria-label={`Explore ${shelf.name}, ${shelf.items.length} ${
                        shelf.items.length === 1 ? "playlist" : "playlists"
                      }`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 5,
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                      }}
                    />
                  )}

                  {/* receding lit glass surface */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "2%",
                      right: "2%",
                      bottom: 12,
                      height: 118,
                      background:
                        "linear-gradient(to top, oklch(0.95 0.05 88 / 0.5), oklch(0.86 0.05 85 / 0.13) 46%, transparent 82%)",
                      clipPath: "polygon(9% 100%, 91% 100%, 76% 0%, 24% 0%)",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: "10%",
                      right: "10%",
                      bottom: 14,
                      height: 70,
                      background:
                        "radial-gradient(60% 120% at 50% 100%, oklch(0.96 0.06 88 / 0.5), transparent 70%)",
                      filter: "blur(9px)",
                      pointerEvents: "none",
                    }}
                  />

                  <div
                    ref={(node) => {
                      rowRefs.current[index] = node;
                    }}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "flex-end",
                      gap: 40,
                      padding: "0 24px 4px",
                    }}
                  >
                    {shelf.items.map((item) => {
                      const gradient = coverGradient(item.title);
                      return (
                        <div
                          key={item.id}
                          style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            animation: "shelfFloat 6s ease-in-out infinite",
                            width: 150,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setPlaying(item)}
                            title={item.title}
                            aria-label={`Play ${item.title}`}
                            style={{
                              padding: 0,
                              border: "none",
                              cursor: "pointer",
                              appearance: "none",
                              position: "relative",
                              width: 150,
                              height: 150,
                              borderRadius: 15,
                              overflow: "hidden",
                              boxShadow:
                                "0 20px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.22)",
                              background: gradient,
                              display: "block",
                              pointerEvents: focused ? "auto" : "none",
                            }}
                          >
                            {item.coverImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.coverImageUrl}
                                alt=""
                                width={150}
                                height={150}
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 12,
                                  left: 14,
                                  fontFamily:
                                    "var(--font-instrument-serif), serif",
                                  fontSize: 50,
                                  lineHeight: 0.9,
                                  color: "var(--ink)",
                                  textShadow: "0 2px 12px rgba(0,0,0,0.3)",
                                }}
                              >
                                {item.title.charAt(0).toUpperCase()}
                              </div>
                            )}

                            <div
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                inset: 0,
                                background:
                                  "radial-gradient(80% 60% at 28% 22%, rgba(255,255,255,0.4), transparent 55%)",
                              }}
                            />
                            <div
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                inset: 0,
                                background:
                                  "repeating-linear-gradient(115deg, transparent 0 12px, rgba(255,255,255,0.06) 12px 13px)",
                              }}
                            />

                            {item.trackCount !== null && (
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  padding: "12px 14px 11px",
                                  background:
                                    "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "var(--ink-dim)",
                                    letterSpacing: "0.2px",
                                  }}
                                >
                                  {item.trackCount} tracks
                                </div>
                              </div>
                            )}

                            <div
                              aria-hidden="true"
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                left: 0,
                                width: "38%",
                                overflow: "hidden",
                                pointerEvents: "none",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  width: "60%",
                                  background:
                                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.26), transparent)",
                                  animation:
                                    "shelfSheen 5.5s ease-in-out infinite",
                                }}
                              />
                            </div>
                          </button>

                          {/* The reflection carries the artwork as an <img>
                              rather than a CSS url(). The url() form needed the
                              address escaped, and CSS.escape is a browser API --
                              this is a client component, but client components
                              still render on the server, where there is no CSS
                              global. It threw only for playlists that actually
                              had cover art, so a profile with none looked fine. */}
                          <div
                            aria-hidden="true"
                            style={{
                              position: "relative",
                              width: 150,
                              height: 52,
                              marginTop: 2,
                              borderRadius: "0 0 15px 15px",
                              overflow: "hidden",
                              background: gradient,
                              opacity: 0.38,
                              WebkitMaskImage:
                                "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 86%)",
                              maskImage:
                                "linear-gradient(to bottom, rgba(0,0,0,0.9), transparent 86%)",
                            }}
                          >
                            {item.coverImageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.coverImageUrl}
                                alt=""
                                width={150}
                                height={150}
                                style={{
                                  width: "100%",
                                  height: 150,
                                  objectFit: "cover",
                                }}
                              />
                            )}
                          </div>

                          <div
                            style={{
                              textAlign: "center",
                              marginTop: 8,
                              opacity: focused ? 1 : 0,
                              transition: "opacity 0.6s ease",
                            }}
                          >
                            <div
                              style={{
                                fontFamily:
                                  "var(--font-ubuntu), system-ui, sans-serif",
                                fontWeight: 500,
                                fontSize: 19,
                                lineHeight: 1.1,
                                color: "var(--ink)",
                                marginBottom: 5,
                              }}
                            >
                              {item.title}
                            </div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "5px 11px",
                                borderRadius: 100,
                                background: "oklch(0.24 0.015 68 / 0.7)",
                                border: "1px solid rgba(255,255,255,0.07)",
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: PROVIDER_DOT[item.provider],
                                  boxShadow: `0 0 8px ${PROVIDER_DOT[item.provider]}`,
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  letterSpacing: "0.3px",
                                  color: "var(--ink-dim)",
                                }}
                              >
                                {item.providerLabel}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    aria-hidden="true"
                    style={{
                      position: "relative",
                      zIndex: 1,
                      height: 16,
                      borderRadius: 5,
                      background:
                        "linear-gradient(to bottom, oklch(0.55 0.03 78 / 0.55), oklch(0.28 0.02 68 / 0.7))",
                      boxShadow:
                        "0 16px 36px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.16)",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    style={{
                      position: "relative",
                      zIndex: 2,
                      height: 3,
                      marginTop: -9,
                      borderRadius: 100,
                      background:
                        "linear-gradient(to right, transparent, oklch(0.97 0.06 88), oklch(0.99 0.03 92) 50%, oklch(0.97 0.06 88), transparent)",
                      boxShadow:
                        "0 0 22px oklch(0.96 0.07 88 / 0.85), 0 0 54px oklch(0.9 0.08 85 / 0.5)",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      zIndex: 3,
                      right: 26,
                      bottom: 20,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 13px",
                      borderRadius: 100,
                      background: "oklch(0.18 0.015 66 / 0.82)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      backdropFilter: "blur(6px)",
                      opacity: active === null ? 1 : 0,
                      transition: "opacity 0.5s",
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-ubuntu), system-ui, sans-serif",
                        fontWeight: 500,
                        fontSize: 16,
                        color: "var(--ink)",
                      }}
                    >
                      {shelf.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ink-dim)",
                      }}
                    >
                      {shelf.items.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <PlayerOverlay
          item={playing}
          gradient={playing ? coverGradient(playing.title) : ""}
          dotColor={playing ? PROVIDER_DOT[playing.provider] : "#fff"}
          onClose={() => setPlaying(null)}
        />

        <footer
          style={{
            position: "relative",
            zIndex: 4,
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            padding: "12px 20px 18px",
            fontSize: 12,
            color: "var(--ink-dim)",
          }}
        >
          <span aria-hidden="true" style={{ color: "var(--ink-dim)" }}>
            🔗
          </span>
          <span style={{ fontWeight: 600, color: "var(--accent)" }}>
            {shareDisplay}
          </span>
        </footer>
      </div>
    </div>
  );
}
