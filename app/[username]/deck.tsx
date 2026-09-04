"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MusicProvider } from "@/app/generated/prisma/enums";

import { PlayerOverlay } from "./player-overlay";
import type { ShowcaseItem } from "./showcase";

/**
 * The playlist deck: covers stacked along a diagonal, scrolled through endlessly.
 *
 * Three states per card, one click apart -- stacked, lifted (title, tracks and
 * source), then open (the provider's player). Clicking off a lifted card returns
 * it to the stack.
 */

const PROVIDER_DOT: Record<MusicProvider, string> = {
  SPOTIFY: "#1ed760",
  YOUTUBE: "#ff3d3d",
  AMAZON: "oklch(0.86 0.08 82)",
  OTHER: "oklch(0.86 0.08 82)",
};

/** Card geometry. Cards recede up and to the right, as in the reference. */
const STEP_X = 76;
const STEP_Y = -58;
/** Cards drawn ahead of the front one. Also what centres the run on the stage. */
const VISIBLE = 6;

/**
 * Fades a card in at the far end and out at the near one, so neither end pops.
 * LAST_DEPTH is the deepest card drawn, so the ramp is spent on cards that are
 * still on screen rather than reaching zero exactly where one sits.
 */
const LAST_DEPTH = VISIBLE - 1;

function edgeFade(depth: number): number {
  if (depth < 0) return Math.max(0, 1 + depth);
  // Starts one card before the end and reaches ~0.3 at the last drawn card, so
  // the far edge sits mid-ramp at rest and dissolves rather than snapping off.
  const fromFar = LAST_DEPTH + 0.4 - depth;
  if (fromFar < 1) return Math.max(0, Math.min(1, fromFar));
  return 1;
}

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

export function Deck({ items }: { items: ShowcaseItem[] }) {
  // Fractional position in the deck. Whole part picks the front card, the
  // remainder is what slides the whole stack between two cards.
  const [offset, setOffset] = useState(0);
  const [lifted, setLifted] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ShowcaseItem | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const count = items.length;

  // The deck is laid out in pixels, so it has to know how much room it has --
  // a fixed 300px card and a fixed lift push it off-centre on a phone.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Narrow screens get a smaller card and a shorter step, so the whole run
  // still fits. 0 means "not measured yet" -- fall back to the desktop size.
  const narrow = stageWidth > 0 && stageWidth < 640;
  const cardSize = narrow ? Math.min(220, stageWidth - 120) : 300;
  const scale = cardSize / 300;

  // The deck spans cardSize + VISIBLE steps. Rather than tune that by hand,
  // derive the step from the room actually left over, so it fits by construction
  // at any width and never has to be re-guessed for a new phone size.
  const stepX = narrow
    ? Math.max(18, (stageWidth - 24 - cardSize) / VISIBLE)
    : STEP_X;
  // Keep the diagonal's slope: y follows x by the same ratio the design uses.
  const stepY = stepX * (STEP_Y / STEP_X);

  // How much of a background card's top edge stays uncovered. The card in front
  // is up by |stepY| as well as right by stepX, so the label band clears it
  // entirely whenever that vertical offset exceeds the band's own height.
  const LABEL_BAND = 44;
  const exposedWidth =
    Math.abs(stepY) >= LABEL_BAND ? cardSize : Math.max(stepX, 56);

  // Wheel and touch drive the deck directly. A real scrollbar would need a tall
  // spacer to scroll against, and it could still hit its end -- this cannot.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;

    const step = (delta: number) => setOffset((o) => o + delta / 420);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      step(event.deltaY);
    };

    let lastTouch: number | null = null;
    const onTouchStart = (event: TouchEvent) => {
      lastTouch = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (y == null || lastTouch == null) return;
      event.preventDefault();
      step(lastTouch - y);
      lastTouch = y;
    };

    // Not passive: both handlers call preventDefault, and Chrome ignores it
    // (with a console warning) on a listener it was allowed to assume passive.
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
    };
  }, [count]);

  // Clicking anywhere that is not a card returns the lifted one to the stack.
  const handleStageClick = useCallback(() => setLifted(null), []);

  useEffect(() => {
    if (!lifted) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLifted(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lifted]);

  if (count === 0) return null;

  return (
    <>
      <div
        ref={stageRef}
        onClick={handleStageClick}
        className="relative h-[100dvh] w-full touch-none overflow-hidden select-none"
        style={{ perspective: 1400 }}
      >
        {items.map((item, index) => {
          // Position relative to the front card, wrapped forward only. Every
          // card sits at depth >= 0, so the deck is one run receding from the
          // viewer rather than two halves meeting at the front.
          let depth = index - offset;
          depth = ((depth % count) + count) % count;

          // The card leaving the front travels a little past it before being
          // recycled to the back, so it slides out instead of vanishing.
          if (depth > count - 1) depth -= count;
          if (depth < -1 || depth > LAST_DEPTH) return null;

          const isLifted = lifted === item.id;
          const dimmed = lifted !== null && !isLifted;

          // The run only goes one way, so its middle -- not its first card --
          // is what belongs at the centre of the stage.
          const centred = depth - VISIBLE / 2;
          // A lifted card goes to the middle of the stage rather than a fixed
          // nudge from wherever it sat: on a phone that nudge left it off-screen.
          const x = isLifted ? 0 : centred * stepX;
          const y = isLifted ? 0 : centred * stepY;
          const z = -depth * 60 * scale + (isLifted ? 160 : 0);

          return (
            <div
              key={item.id}
              data-card={item.id}
              onClick={(event) => {
                event.stopPropagation();
                // Second click on an already-lifted card opens the player.
                if (isLifted) setPlaying(item);
                else setLifted(item.id);
              }}
              className="absolute cursor-pointer transition-transform duration-500 ease-out"
              style={{
                left: "50%",
                top: "50%",
                width: cardSize,
                height: cardSize,
                marginLeft: -cardSize / 2,
                marginTop: -cardSize / 2,
                transform: `translate3d(${x}px, ${y}px, ${z}px)`,
                // Nearest card highest. |depth| so the one card on its way out
                // (depth just below 0) drops behind rather than above the front.
                zIndex: Math.round(1000 - Math.abs(depth) * 10) + (isLifted ? 500 : 0),
                opacity: dimmed ? 0.45 : edgeFade(depth),
                transitionProperty: "transform, opacity",
              }}
            >
              {/* The nearest card, by the same wrapped depth that positions it --
                  an index comparison drifts out of step once the deck wraps. */}
              <Card
                item={item}
                lifted={isLifted}
                front={Math.abs(depth) < 0.5}
                exposed={exposedWidth}
              />
            </div>
          );
        })}
      </div>

      <PlayerOverlay
        item={playing}
        gradient={playing ? coverGradient(playing.title) : ""}
        dotColor={playing ? PROVIDER_DOT[playing.provider] : "#fff"}
        onClose={() => setPlaying(null)}
      />
    </>
  );
}

function Card({
  item,
  lifted,
  front,
  exposed,
}: {
  item: ShowcaseItem;
  lifted: boolean;
  front: boolean;
  /** Width of the strip this card still shows past the one in front of it. */
  exposed: number;
}) {
  return (
    <div
      className="relative size-full overflow-hidden rounded-[10px] transition-shadow duration-500"
      style={{
        background: item.coverImageUrl ? "#0a0806" : coverGradient(item.title),
        boxShadow: lifted
          ? "0 40px 90px rgba(0,0,0,0.7)"
          : "0 18px 44px rgba(0,0,0,0.5)",
        outline: lifted ? "1px solid rgba(255,255,255,0.22)" : "none",
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

      {/* The detail panel belongs to the lifted state only. It is always in the
          tree so it can fade rather than pop. */}
      <div
        aria-hidden={!lifted}
        className="absolute inset-x-0 top-0 flex flex-col items-end gap-1 p-4 text-right transition-opacity duration-300"
        style={{
          opacity: lifted ? 1 : 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.92) 20%, rgba(0,0,0,0.55) 60%, transparent)",
        }}
      >
        <p className="max-w-full truncate text-base font-bold text-white">
          {item.title}
        </p>
        <p className="flex items-center justify-end gap-2 text-xs text-[#c8c8c8]">
          <span
            className="inline-block size-1.5 shrink-0 rounded-full"
            style={{ background: PROVIDER_DOT[item.provider] }}
          />
          <span className="truncate">{item.providerLabel}</span>
          {item.trackCount != null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">{item.trackCount} songs</span>
            </>
          )}
        </p>
      </div>

      {/* Every stacked card names itself, pinned to the top-right corner. The
          corner is the strip each card still shows past the one in front, and
          anchoring right means the text does not shift as a card advances. */}
      {!lifted && (
        <p
          className="absolute top-0 right-0 truncate bg-gradient-to-b from-black/85 to-transparent p-4 text-right font-medium text-white transition-all duration-300"
          style={{
            // A width cap, not a position: the label grows leftward from the
            // fixed right edge and truncates if the strip is too narrow.
            maxWidth: Math.round(exposed),
            fontSize: front ? 14 : 12,
            opacity: front ? 1 : 0.75,
          }}
        >
          {item.title}
        </p>
      )}
    </div>
  );
}
