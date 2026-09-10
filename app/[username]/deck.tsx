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
/** How long one card's advance takes, in ms. Long enough to read the orbit. */
const ADVANCE_MS = 620;
/** Pixels a touch must travel before it counts as a swipe. */
const TOUCH_THRESHOLD = 24;

/** Fraction of the journey spent sliding clear before the arc begins. */
const SLIDE_PHASE = 0.5;

/** Depth range an orbiting card travels through, in cards. */
const ORBIT_SPAN = 1;
/** Below every stacked card: the deepest sits at 1000 - LAST_DEPTH * 10. */
const ORBIT_Z = 1000 - (VISIBLE + 2) * 10;

/**
 * Where a recycling card sits, as an offset from its straight-line position.
 *
 * `t` runs 0 (still at the front) to 1 (arrived at the back). The card bulges
 * out to the right of the run, which is the open half of the stage -- the front
 * card sits near the left edge, so a leftward arc runs off screen.
 */
function orbitAt(
  t: number,
  cardSize: number,
  runLength: number,
  stepX: number,
  stepY: number
): {
  dx: number;
  dy: number;
  scale: number;
  behind: number;
  inFront: boolean;
} {
  // The straight line already carries it one step; the arc has to undo that and
  // deliver it the whole length of the run instead.
  const spanX = runLength * stepX + stepX;
  const spanY = runLength * stepY + stepY;
  // The journey has two parts. First the card slides straight down its own
  // height, clearing the card behind it; only then does it arc away. Starting
  // the arc immediately made it cut across its neighbour.
  const slide = Math.min(1, t / SLIDE_PHASE);
  const arcT = Math.max(0, (t - SLIDE_PHASE) / (1 - SLIDE_PHASE));

  // Half a turn, raised to a power below 1 so it leaves the deck quickly rather
  // than easing away: a plain sine barely moves at first.
  const swing = Math.pow(Math.sin(arcT * Math.PI), 0.55);
  const reach = cardSize * 0.75;
  // Travel along the deck is held back until the card has pulled clear of it.
  const along = arcT * arcT * (3 - 2 * arcT);
  // Linear: the advance's own ease already shapes the timing, and easing twice
  // left the card sitting still for the first hundred milliseconds.
  const drop = slide;

  // Right and slightly down: perpendicular to a run that recedes up-and-right,
  // so the bulge is into empty space rather than across the deck. The sign is
  // fixed, so the arc bows the same way whichever way the deck is scrolled.
  return {
    dx: spanX * along + swing * reach,
    // The slide's own drop is undone as the arc takes over, so the card does
    // not carry a permanent offset into its landing slot.
    dy: spanY * along + swing * reach * 0.55 + drop * (1 - along) * cardSize,
    // Smallest at the midpoint, back to full size as it lands.
    scale: 1 - swing * 0.42,
    // Behind from the first frame: the card is dropping below the deck, so it
    // must never be painted over the stack, not even for the slide.
    behind: Math.max(drop, swing),
    // The front card starts in front and has to stay there while it slides
    // clear. Only once the slide is done does it belong behind the stack.
    inFront: slide < 1,
  };
}
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
const LAST_DEPTH = VISIBLE + 1;

function edgeFade(depth: number, deepestDrawn: number): number {
  if (depth < 0) return Math.max(0, 1 + depth);
  // Half-faded at the deepest card drawn: solid enough to read, clearly on its
  // way out. Anchoring to that card rather than the window's edge is what stops
  // the last slot rendering at zero.
  const fromFar = deepestDrawn + 0.5 - depth;
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
  // The animation reads and writes offset outside React's render cycle, so it
  // needs a ref: reading state inside the frame loop would see a stale value.
  const offsetRef = useRef(0);
  const animating = useRef(false);
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
  // On a deck short enough to wrap, the orbit delivers cards to the back in
  // full view, so nothing needs to fade in there. On a longer one it does.
  const deepestDrawn = count <= LAST_DEPTH ? Infinity : LAST_DEPTH - 1;
  // Scaled with the run so a short deck is not pushed off to one side by a bias
  // meant for a full one.
  const frontInset = (FRONT_INSET / VISIBLE) * runLength;

  // The card in front sits one step up and one step right, so a background card
  // shows an L of that width. The label lives in the top-right of it.
  const exposedWidth = cardSize - stepX;

  // One gesture advances exactly one card, and the motion always plays out.
  // Tracking the finger left a card frozen part-way round its orbit whenever a
  // scroll stopped short.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;

    let frame = 0;
    const advance = (direction: number) => {
      // Ignored while one is running: a second card starting mid-flight is what
      // "complete the motion" is meant to prevent.
      if (animating.current) return;
      animating.current = true;

      const from = offsetRef.current;
      const to = Math.round(from) + direction;
      const started = performance.now();

      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / ADVANCE_MS);
        // Mostly ease-out: the card should answer the gesture at once and settle
        // gently. A symmetric cubic left it near-motionless for the first 100ms.
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

    // Touch commits on release, from the distance travelled: a drag is one
    // gesture however many move events it fires.
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

    // Not passive: the handlers call preventDefault, and Chrome ignores it on a
    // listener it was allowed to assume passive.
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

          // A card leaving the front is pulled below zero so it can orbit round
          // to the back. It has to start that journey while it is still the
          // deepest card, or there would be no room to travel.
          if (depth > count - ORBIT_SPAN) depth -= count;
          if (depth < -ORBIT_SPAN || depth >= LAST_DEPTH) return null;

          const isLifted = lifted === item.id;
          const dimmed = lifted !== null && !isLifted;

          // The design anchors the front card near the left edge and steps up and
          // right from there, letting the far cards run off-screen. Biasing the
          // run this way keeps the front card whole -- centring on the full span
          // pushed it off the left edge, since the far end is what overflows.
          const centred = depth - frontInset;
          // A lifted card goes to the middle of the stage rather than a fixed
          // nudge from wherever it sat: on a phone that nudge left it off-screen.
          const restX = centred * stepX;
          // y is centred on the run's own middle, not on frontInset: that bias
          // exists to keep the front card clear of the left edge, and reusing it
          // here dragged the whole block above centre.
          const yStep = depth - runLength / 2;
          const restY = yStep * stepY - CHROME_OFFSET;

          // Between depth -1 and 0 a card is recycling: it leaves the front and
          // rejoins at the back. `orbit` carries it round the left side instead
          // of letting it fade out and reappear.
          const orbit =
            depth < 0
              ? orbitAt(-depth / ORBIT_SPAN, cardSize, runLength, stepX, stepY)
              : null;
          const x = isLifted ? 0 : restX + (orbit?.dx ?? 0);
          const y = isLifted ? 0 : restY + (orbit?.dy ?? 0);
          // An orbiting card travels well behind the deepest card, so it reads
          // as going around the back rather than sliding across the front.
          const z =
            -depth * 34 * scale +
            (isLifted ? 160 : 0) -
            (orbit ? orbit.behind * cardSize * 1.6 : 0);

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
                transform: `translate3d(${x}px, ${y}px, ${z}px)${
                  orbit ? ` scale(${orbit.scale.toFixed(3)})` : ""
                }`,
                // Nearest card highest. An orbiting card goes below the whole
                // stack: it is travelling round the back to rejoin there, so
                // passing over the deck would read as going the wrong way.
                // Stays in front until it has pulled clear of the deck, then
                // drops behind. Dropping at once made it clip through the card
                // it was still overlapping.
                // In front while it slides clear -- it was the front card, so
                // ducking behind immediately read as a jump -- then behind for
                // the arc, which is the half that travels round the back.
                zIndex: orbit
                  ? orbit.inFront
                    ? 1010
                    : ORBIT_Z
                  : Math.round(1000 - Math.abs(depth) * 10) + (isLifted ? 500 : 0),
                // An orbiting card stays solid -- the old exit fade was there to
                // hide a teleport, and the arc is the thing to watch now.
                opacity: dimmed
                  ? 0.45
                  : orbit
                    ? 1
                    : edgeFade(depth, deepestDrawn),
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
