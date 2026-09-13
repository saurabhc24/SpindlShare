"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MusicProvider } from "@/app/generated/prisma/enums";

import { PlayerOverlay } from "./player-overlay";
import type { ShowcaseItem } from "./playlist-item";

/**
 * Covers riding a circle whose centre sits off-screen to the left.
 *
 * Scrolling rotates them around it; whichever reaches the arc's rightmost point
 * is selected, and its details sit beside it. The curve is the whole idea, so
 * the geometry is angles on a circle rather than a list with a transform.
 */

const PROVIDER_DOT: Record<MusicProvider, string> = {
  SPOTIFY: "#1ed760",
  YOUTUBE: "#ff3d3d",
  AMAZON: "oklch(0.86 0.08 82)",
  OTHER: "oklch(0.86 0.08 82)",
};

/** Radius as a multiple of the stage height: bigger means a flatter curve. */
const RADIUS_RATIO = 2.1;
/** Cover edge as a fraction of stage height. */
const COVER_RATIO = 0.17;
/** Gap between covers, as a fraction of a cover. The design leaves a hairline. */
const GAP_RATIO = 0.1;
/** How long one step takes. */
const ADVANCE_MS = 520;
/** A drag shorter than this is a tap, not a swipe. */
const TOUCH_THRESHOLD = 24;
/** Blur on the outermost cover, in px. */
const MAX_END_BLUR = 6;
/** Space between the selected cover and its details. */
const DETAIL_GAP = 40;

function hueFromKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/**
 * Blur for a cover `away` steps from the selection. Nothing near the middle,
 * rising toward the ends so the arc fades out instead of being cut off.
 *
 * `reach` is how far a card actually gets, not the drawing span: with fewer
 * playlists than the span the wrap clamps it, and keying on span left the ramp
 * barely started.
 */
function endBlur(away: number, reach: number): number {
  if (reach <= 1) return 0;
  const start = reach * 0.35;
  if (away <= start) return 0;
  return ((away - start) / (reach - start)) * MAX_END_BLUR;
}

function coverGradient(key: string): string {
  const hue = hueFromKey(key);
  return `linear-gradient(150deg, oklch(0.68 0.19 ${hue}), oklch(0.5 0.16 ${(hue + 30) % 360}))`;
}

export function Arc({ items }: { items: ShowcaseItem[] }) {
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState<ShowcaseItem | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const animating = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const count = items.length;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // One gesture moves one cover, and the motion always plays out.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;

    let frame = 0;
    const advance = (direction: number) => {
      if (animating.current) return;
      animating.current = true;
      const from = offsetRef.current;
      const to = Math.round(from) + direction;
      const started = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / ADVANCE_MS);
        const eased = 1 - Math.pow(1 - t, 2.4);
        const next = from + (to - from) * eased;
        offsetRef.current = next;
        setOffset(next);
        if (t < 1) frame = requestAnimationFrame(tick);
        else animating.current = false;
      };
      frame = requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaY) < 1) return;
      advance(Math.sign(event.deltaY));
    };

    let startY: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (startY != null) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      const y = event.changedTouches[0]?.clientY;
      if (y == null || startY == null) return;
      const travelled = startY - y;
      startY = null;
      if (Math.abs(travelled) < TOUCH_THRESHOLD) return;
      advance(Math.sign(travelled));
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
    };
  }, [count]);

  const selectedIndex = ((Math.round(offset) % count) + count) % count;
  const selected = items[selectedIndex];

  // Geometry. The circle's centre sits left of the stage, so the arc bulges
  // right and the covers nearest the middle come furthest forward.
  const radius = Math.max(280, size.h * RADIUS_RATIO);
  const coverSize = Math.max(64, size.h * COVER_RATIO);
  // Derived, not fixed: the arc length between two covers has to equal a cover
  // plus its gap, or the ribbon either overlaps or falls apart.
  const stepDeg =
    ((coverSize * (1 + GAP_RATIO)) / radius) * (180 / Math.PI);
  // Enough to fill the visible half of the circle, however big the covers are.
  const span = Math.ceil(110 / stepDeg);
  // The wrap keeps a card within half the deck, so on a short deck that, not
  // the span, is the furthest anything is ever drawn.
  const blurReach = Math.min(span, count / 2);

  // The arc's rightmost point, where the selected cover lands.
  const centreX = -radius + coverSize * 0.9;
  // The selected cover sits at angle 0, so its centre is centreX + radius.
  const selectedRight = centreX + radius + coverSize / 2;
  const centreY = size.h / 2;

  const select = useCallback((delta: number) => {
    if (animating.current) return;
    offsetRef.current = Math.round(offsetRef.current) + delta;
    setOffset(offsetRef.current);
  }, []);

  if (count === 0) return null;

  return (
    <>
      <div
        ref={stageRef}
        className="relative h-[100dvh] w-full touch-none overflow-hidden select-none"
      >
        {/* The rail the covers ride, drawn as a ring far wider than the stage so
            only its right edge shows. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full border"
          style={{
            width: radius * 2,
            height: radius * 2,
            left: centreX - radius,
            top: centreY - radius,
            borderColor: "rgba(255,255,255,0.07)",
          }}
        />

        {items.map((item, index) => {
          let step = index - offset;
          step = ((step % count) + count) % count;
          if (step > count / 2) step -= count;
          if (step < -span || step > span) return null;

          const angle = (step * stepDeg * Math.PI) / 180;
          const x = centreX + radius * Math.cos(angle);
          const y = centreY + radius * Math.sin(angle);
          const away = Math.abs(step);
          const isSelected = away < 0.5;

          return (
            <button
              key={item.id}
              type="button"
              data-cover={item.id}
              aria-current={isSelected}
              onClick={() => (isSelected ? setPlaying(item) : select(step))}
              className="absolute cursor-pointer overflow-hidden transition-[opacity,box-shadow] duration-300"
              style={{
                width: coverSize,
                height: coverSize,
                left: 0,
                top: 0,
                // Matches the stacked deck's card, so the two layouts share a
                // shape. It also rounds away the corner splay the taper used to
                // correct, which is why that clip is gone.
                borderRadius: 10,
                // Rotated to sit square to the arc, the way a card on a wheel does.
                transform: `translate3d(${x - coverSize / 2}px, ${y - coverSize / 2}px, 0) rotate(${step * stepDeg}deg)`,
                background: item.coverImageUrl
                  ? "#0a0806"
                  : coverGradient(item.id),
                opacity: Math.max(0.12, 1 - away / (span * 0.75)),
                // Inset, not an outer ring: clip-path cuts off anything drawn
                // outside the shape, so an outer box-shadow simply vanished.
                boxShadow: isSelected
                  ? "inset 0 0 0 3px rgba(255,255,255,0.95)"
                  : "inset 0 0 0 1px rgba(0,0,0,0.35)",
                // Dimmed so the selection reads, and blurred further out so the
                // ribbon dissolves at the ends of the arc rather than stopping.
                filter: isSelected
                  ? "none"
                  : `brightness(0.62) blur(${endBlur(away, blurReach).toFixed(2)}px)`,
                zIndex: Math.round(500 - away * 10),
              }}
            >
              {item.coverImageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.coverImageUrl}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                />
              )}
              <span className="sr-only">{item.title}</span>
            </button>
          );
        })}

        {/* The selected playlist's details, beside the arc's rightmost point. */}
        <div
          className="pointer-events-none absolute flex flex-col gap-1"
          style={{
            // Measured from where the selected cover actually sits -- it is
            // centred on the arc, so its right edge is not at coverSize.
            left: selectedRight + DETAIL_GAP,
            top: centreY - coverSize * 0.55,
            maxWidth: `calc(100% - ${selectedRight + DETAIL_GAP + 16}px)`,
          }}
        >
          {/* The bar the design puts against the selected row's title. */}
          <span
            aria-hidden="true"
            className="absolute top-0 -left-3 h-full w-[3px]"
            style={{ background: "var(--accent)" }}
          />
          <p className="truncate text-base font-medium tracking-wide text-white uppercase">
            {selected.title}
          </p>
          <p className="truncate text-xs text-[#c8c8c8]">
            {selected.providerLabel}
            {selected.trackCount != null && ` · ${selected.trackCount} tracks`}
          </p>

          <span className="mt-2 flex items-center gap-4">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: PROVIDER_DOT[selected.provider] }}
            />
          </span>
        </div>
      </div>

      <PlayerOverlay
        item={playing}
        gradient={playing ? coverGradient(playing.id) : ""}
        dotColor={playing ? PROVIDER_DOT[playing.provider] : "#fff"}
        onClose={() => setPlaying(null)}
      />
    </>
  );
}
