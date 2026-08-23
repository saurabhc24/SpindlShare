"use client";

import Link from "next/link";
import { useRef, type MouseEvent, type ReactNode } from "react";

/**
 * The landing page's foot, and the sign-in card the two links open.
 *
 * A native <dialog> rather than a positioned div. `showModal()` brings focus
 * trapping, Escape-to-close, inert background content and the top layer with it
 * -- the top layer being what lets the card escape #landing-scene's
 * `overflow: hidden` instead of being clipped by it. Reimplementing that by hand
 * is where accessible modals usually go wrong.
 *
 * Both links keep their real href. If dialog support or JavaScript is missing
 * the click is never intercepted and the browser goes to /login, which still
 * exists and does the same job -- so the card is an enhancement rather than a
 * requirement. The sign-in forms themselves stay on the server, passed in as
 * children.
 */
export function LandingActions({ children }: { children: ReactNode }) {
  const sheet = useRef<HTMLDialogElement>(null);

  const openSheet = (event: MouseEvent<HTMLAnchorElement>) => {
    const dialog = sheet.current;
    if (typeof dialog?.showModal !== "function") return;
    event.preventDefault();
    dialog.showModal();
  };

  return (
    <>
      <div
        id="landing-actions"
        className="flex flex-col items-center gap-3.5 pt-8"
      >
        <Link
          id="landing-cta"
          href="/login"
          onClick={openSheet}
          className="btn-gold !px-6 !py-3"
        >
          Claim your link
        </Link>

        <p
          id="landing-signin"
          className="flex flex-wrap items-center justify-center gap-1 text-[11px] text-ink"
        >
          Already have an account?{" "}
          <Link
            href="/login"
            onClick={openSheet}
            className="font-semibold text-accent underline underline-offset-4"
          >
            Sign In
          </Link>
        </p>

        {/* The frame sets the wordmark in Maxi, not the headline's Midi. Size
            and tracking come from .wordmark now -- this is the size the rest of
            the app matches, so it belongs to the class rather than to here. */}
        <span id="landing-wordmark" className="wordmark mt-3">
          SpindlShare
        </span>

        {/* Google's OAuth review expects the privacy policy and terms to be
            reachable from the home page, not only from the consent screen.
            Deliberately quiet: they are a requirement and a courtesy, not part
            of the pitch. */}
        <p
          id="landing-legal"
          className="flex items-center gap-2 text-[11px] text-ink"
        >
          <Link
            href="/privacy"
            className="transition-colors hover:text-ink-dim"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="transition-colors hover:text-ink-dim">
            Terms of Service
          </Link>
        </p>
      </div>

      <dialog
        id="signin-card"
        ref={sheet}
        className="sheet"
        aria-labelledby="signin-card-title"
        // A click on the backdrop reports the dialog itself as the target, which
        // is the only way to tell the two apart -- the backdrop is a pseudo
        // element and cannot be listened to directly.
        onClick={(event) => {
          if (event.target === sheet.current) sheet.current?.close();
        }}
      >
        <div
          id="signin-card-panel"
          className="mx-auto w-full max-w-[26rem] rounded-t-[28px] border border-b-0 border-[var(--line-strong)] bg-[var(--panel-solid)] px-6 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-7 sm:rounded-[28px] sm:border-b sm:pb-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="signin-card-title" className="heading text-2xl">
                Sign in
              </h2>
              <p className="mt-1 text-sm text-ink">
                Build your SpindlShare in under a minute.
              </p>
            </div>
            <button
              type="button"
              onClick={() => sheet.current?.close()}
              aria-label="Close"
              className="-mr-2 -mt-1 rounded-full px-3 py-2 text-lg leading-none text-ink-faint transition-colors hover:text-ink"
            >
              &times;
            </button>
          </div>

          <div className="mt-6">{children}</div>
        </div>
      </dialog>
    </>
  );
}
