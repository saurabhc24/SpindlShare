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

/**
 * Card geometry, as ratios rather than pixels.
 *
 * The design draws a 184px card stepping 40px on both axes inside a 504px box.
 * Keeping those as fractions is what lets the deck scale with the screen: the
 * card is sized from the viewport and every offset follows from it.
 */
const STEP_RATIO = 40 / 184;
/** Cards drawn behind the front one. Nine in the design, front card included. */
const VISIBLE = 8;
/** Header is taller than the footer, so the free space is not the viewport's middle. */
const CHROME_OFFSET = 26;
/**
 * How far into the run the stage's centre falls. Below VISIBLE/2, so the front
 * card sits left of centre with room to spare and the far cards -- the ones the
 * design lets bleed off -- take the overflow.
 */
const FRONT_INSET = 2.2;

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

/**
 * A stable hue per playlist for covers with no artwork.
 *
 * Keyed on the id, not the title: two playlists called "Liked Songs" are two
 * different playlists, and hashing the title gave them the same colour and made
 * the deck look like one card repeated.
 */
function hueFromKey(key: string): number {
  // FNV-1a. The old `hash * 31 % 360` barely moved between neighbouring cuids --
  // they share a long prefix, so two playlists created seconds apart came out
  // the same colour. Taking the modulo only at the end is what spreads them.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

function coverGradient(key: string): string {
  const hue = hueFromKey(key);
  return `linear-gradient(150deg, oklch(0.68 0.19 ${hue}), oklch(0.5 0.16 ${(hue + 30) % 360}))`;
}

export function Deck({ items }: { items: ShowcaseItem[] }) {
  // Fractional position in the deck. Whole part picks the front card, the
  // remainder is what slides the whole stack between two cards.
  const [offset, setOffset] = useState(0);
  const [lifted, setLifted] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ShowcaseItem | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  const count = items.length;

  // The deck is laid out in pixels, so it has to know how much room it has --
  // a fixed 300px card and a fixed lift push it off-centre on a phone.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
      setStageHeight(entry.contentRect.height);
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // The design's proportions, solved for the space available. The run spans
  // card + VISIBLE steps, and a step is STEP_RATIO of a card, so the card falls
  // out of one equation -- no per-breakpoint constants to re-guess.
  // The design's block is 504 wide in a 393 frame -- it deliberately overflows
  // the screen, with the far cards running off the right edge. Sizing from the
  // frame reproduces that: card = 184/393 of the width.
  const usable = Math.max(0, stageWidth - 48);
  // Also capped by height: the run is card + VISIBLE steps tall as well as wide,
  // and on a short landscape window the width-derived size runs off the bottom.
  const roomForRun = Math.max(0, stageHeight - 220) / (1 + VISIBLE * STEP_RATIO);
  const cardSize = Math.min(
    360,
    Math.max(120, Math.min(usable * (184 / (393 - 48)), roomForRun || Infinity))
  );
  const scale = cardSize / 184;
  // Equal on both axes: the design's diagonal is 45 degrees.
  const stepX = cardSize * STEP_RATIO;
  const stepY = -stepX;

  // Three playlists make a run three long, not eight. Centring on VISIBLE
  // regardless left a short deck low and to the right of the stage.
  const runLength = Math.min(VISIBLE, count);
  // Scaled with the run so a short deck is not pushed off to one side by a bias
  // meant for a full one.
  const frontInset = (FRONT_INSET / VISIBLE) * runLength;

  // The card in front sits one step up and one step right, so a background card
  // shows an L of that width. The label lives in the top-right of it.
  const exposedWidth = cardSize - stepX;

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

          // The design anchors the front card near the left edge and steps up and
          // right from there, letting the far cards run off-screen. Biasing the
          // run this way keeps the front card whole -- centring on the full span
          // pushed it off the left edge, since the far end is what overflows.
          const centred = depth - frontInset;
          // A lifted card goes to the middle of the stage rather than a fixed
          // nudge from wherever it sat: on a phone that nudge left it off-screen.
          const x = isLifted ? 0 : centred * stepX;
          // y is centred on the run's own middle, not on frontInset: that bias
          // exists to keep the front card clear of the left edge, and reusing it
          // here dragged the whole block above centre.
          const yStep = depth - runLength / 2;
          const y = isLifted ? 0 : yStep * stepY - CHROME_OFFSET;
          const z = -depth * 34 * scale + (isLifted ? 160 : 0);

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
                exposed={exposedWidth}
                labelScale={scale}
              />
            </div>
          );
        })}
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

function Card({
  item,
  lifted,
  exposed,
  labelScale,
}: {
  item: ShowcaseItem;
  lifted: boolean;
  /** Width of the strip this card still shows past the one in front of it. */
  exposed: number;
  /** Card size relative to the design's 184px, so the label scales with it. */
  labelScale: number;
}) {
  // The label sits 16px down and is ~24px tall, so the band must clear ~40px
  // before it starts fading, plus a tail.
  const labelBand = Math.round(50 + 14 * labelScale);
  return (
    <div
      className="relative size-full overflow-hidden rounded-[10px] transition-shadow duration-500"
      style={{
        background: item.coverImageUrl ? "#0a0806" : coverGradient(item.id),
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
        <>
          {/* Two layers: a band that holds the label's own row at full strength,
              and a corner wash that fades it into the cover instead of edging. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              // Solid to the label's baseline, then a short tail. Fading across
              // the whole band left the text's own row barely darkened.
              height: labelBand,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.8) 58%, rgba(0,0,0,0.42) 78%, rgba(0,0,0,0) 100%)",
            }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 42% at 100% 0%, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.16) 60%, rgba(0,0,0,0) 100%)",
            }}
          />
          <p
            className="absolute top-0 right-0 truncate px-3 py-2.5 text-right font-extrabold text-white uppercase"
            style={{
              // A width cap, not a position: the label grows leftward from the
              // fixed right edge and truncates if the strip is too narrow.
              maxWidth: Math.round(exposed),
              // Scales with the card so it holds its proportion on a phone.
              fontSize: Math.max(10, Math.round(14 * labelScale)),
              textShadow: "0 1px 3px rgba(0,0,0,0.55)",
            }}
          >
            {item.title}
          </p>
        </>
      )}
    </div>
  );
}
