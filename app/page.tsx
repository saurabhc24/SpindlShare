import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { SignInOptions } from "@/components/sign-in-options";

import { HalftoneField } from "./halftone-field";
import { LandingActions } from "./landing-actions";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/**
 * Where the deck actually sits inside turntable_image.png, measured from the
 * file rather than guessed at: it is 510x489, and the artwork occupies only
 * y 174..317. A third of the file is empty above the deck and a third below.
 * Cropping against the file's own edges therefore crops mostly nothing, which
 * is why the deck used to float clear of the screen edge instead of running off
 * it -- every offset below is built from these bounds instead.
 */
const ART = { width: 510, height: 489, top: 174, bottom: 317 };

const DECK_TOP = ART.top / ART.height;
const DECK_BOTTOM = ART.bottom / ART.height;
const ASPECT = ART.height / ART.width;

/** A little air above the deck, and how much of its height survives the cut. */
const HEADROOM = 0.045;
const SHOWN = 0.88;

/**
 * Both derived from the deck's width, so the band and the artwork inside it
 * cannot drift apart -- as two independently tuned expressions previously could.
 * BAND is how tall a slice the viewport keeps; LIFT is how far the artwork rides
 * up inside it so the slice starts just above the deck rather than in the file's
 * empty upper third.
 */
const BAND = (HEADROOM + SHOWN * (DECK_BOTTOM - DECK_TOP)) * ASPECT;
const LIFT = (DECK_TOP - HEADROOM) * ASPECT;

/**
 * The landing page, from the Figma design (node 44:6).
 *
 * The composition is the design's: the headline and its line of copy set left
 * near the top, a deliberate void, then the call to action, sign-in and wordmark
 * gathered at the foot above a turntable bleeding off the bottom edge.
 *
 * Proportions rather than measurements. The frame is a fixed 393x852 phone, and
 * its offsets are expressed here as fractions of the viewport, so the page holds
 * its shape on a taller phone and in a desktop window instead of pinning text to
 * pixel rows that only mean something at one size.
 *
 * Colours and type come from the project's tokens rather than the frame's raw
 * hexes, which are near-identical: #ffe59e->#dfb84d is --gold, #dfb84d is
 * --accent, #c9bd9d is --ink-dim. The backdrop is the one deliberate departure --
 * the scene gradient every other page uses, rather than the frame's flat
 * #272727, so the landing page stays in the same room as the rest of the app.
 *
 * Every element carries an id, so a change can be asked for by name instead of
 * by description:
 *
 *   #landing-scene         the full-screen frame everything sits in
 *   #halftone                the animated backdrop (see halftone-field.tsx)
 *   #landing-content         the centred column, and its padding
 *     #landing-headline        "Everything you've got spinning"
 *     #landing-subcopy         the line under it
 *     #landing-void            the deliberate gap the design leaves
 *     #landing-actions         the block at the foot (see landing-actions.tsx)
 *       #landing-cta             "Claim your link"
 *       #landing-signin          "Already have an account? Sign In"
 *       #landing-wordmark        "SpindlShare"
 *   #landing-deck          the strip the turntable shows through
 *     #landing-deck-image    the artwork inside it
 *   #signin-card           the slide-in sign-in dialog, and its blurred backdrop
 *     #signin-card-panel     the panel inside it
 */
export default function Home() {
  return (
    <div
      id="landing-scene"
      data-shelf-scene
      className="scene relative flex h-[100dvh] flex-col overflow-hidden"
      style={
        {
          // One width drives the deck and the strip of it the page keeps, so
          // the copy's bottom padding and the band below it stay in step. The
          // 80vh term is for short landscape windows, where a width-only
          // measure would hand half the screen to the deck.
          "--deck": "min(106vw, 560px, 80vh)",
          "--band": `calc(var(--deck) * ${BAND.toFixed(4)})`,
        } as CSSProperties
      }
    >
      <HalftoneField />

      {/* The frame starts the headline about a fifth of the way down. Held as a
          fraction so it stays a fifth on any screen, with a floor for very short
          windows where a proportional gap would leave nothing for the copy. */}
      <main
        id="landing-content"
        className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col px-7 pb-[var(--band)] pt-[max(64px,19vh)]"
      >
        <h1
          id="landing-headline"
          className="display max-w-[19rem] text-[clamp(26px,4.4vh,36px)] leading-[1.12] sm:text-[40px]"
        >
          Everything you&apos;ve got spinning
        </h1>
        <p
          id="landing-subcopy"
          className="mt-6 max-w-[19rem] text-[15px] leading-relaxed text-ink"
        >
          One page for the playlists you already made on Spotify and YouTube.
          Pick which ones to show, and share them all from a single link.
        </p>

        {/* The frame leaves a deliberate void here, pushing the actions to the
            foot of the screen rather than stacking them under the copy. */}
        <div id="landing-void" className="flex-1" />

        {/* The card's contents are rendered here, on the server, and handed to
            the client component as children -- so the sign-in actions and the
            provider configuration never reach the browser. */}
        <LandingActions>
          <SignInOptions redirectTo="/dashboard" />
        </LandingActions>
      </main>

      {/* Pinned to the foot rather than placed in the flow: in the flow it was
          added after main had already filled the viewport, so the page grew past
          one screen and the band sat below the fold. The band's bottom IS the
          bottom of the screen, so what it clips is clipped by the viewport --
          the deck runs off the edge rather than resting above it. Decorative:
          the copy above already says what the page is.

          The deck is capped at a phone-ish width instead of tracking the
          viewport. Sized to the full page it reached ~2000px across on a
          desktop, which made it ~1950px tall, and the short band then showed a
          hugely magnified sliver of its middle. */}
      <div
        id="landing-deck"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[var(--band)] select-none overflow-hidden"
      >
        {/* Ridden up by LIFT so the band opens just above the deck instead of in
            the file's empty upper third, and left long below so its base leaves
            the screen. Anchored by the top -- centring is what put the empty
            third back under the deck and held it clear of the edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          id="landing-deck-image"
          src="/turntable_image.png"
          alt=""
          width={ART.width}
          height={ART.height}
          className="absolute left-1/2 w-[var(--deck)] max-w-none -translate-x-1/2"
          style={{ top: `calc(var(--deck) * -${LIFT.toFixed(4)})` }}
        />
      </div>
    </div>
  );
}
