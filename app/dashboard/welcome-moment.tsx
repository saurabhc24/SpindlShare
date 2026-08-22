"use client";

import { useEffect, useRef } from "react";

/**
 * The first thing a new account sees. Nothing dismisses it but the person in
 * front of it -- a timer would contradict the words on the screen.
 */
export function WelcomeMoment({
  displayName,
  handle,
}: {
  displayName: string;
  handle: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    // Stripped as it opens, so a refresh can't replay the celebration -- and
    // history keeps the clean URL if they leave mid-welcome.
    const url = new URL(window.location.href);
    if (url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    dialog.current?.showModal?.();
    // showModal() would focus the button, and Chrome counts that as
    // focus-visible -- a focus ring on open that the design doesn't have.
    dialog.current?.focus();
  }, []);

  const dismiss = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      data-welcome
      className="welcome"
      aria-labelledby="welcome-title"
      tabIndex={-1}
      // The whole surface dismisses, so nobody has to find the button.
      onClick={dismiss}
    >
      <div className="relative flex h-full flex-col items-center justify-center px-8 pb-[16.5vh] text-center">
        <div
          aria-hidden="true"
          className="relative h-24 w-24"
          style={{
            animation: "discArrive 700ms cubic-bezier(0.22,1,0.36,1) both",
          }}
        >
          {/* Two nested rotations that compose: the outer settles, the inner
              keeps turning. On one element the later would replace the earlier. */}
          <div
            className="absolute inset-0"
            style={{
              animation: "discSpinUp 2.6s cubic-bezier(0.16,0.8,0.3,1) both",
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                // A line every three pixels reads as a record catching the
                // light; the first colour repeats last so the cone has no seam.
                backgroundImage: `repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0.14) 0 1px, transparent 1px 3px),
                                  conic-gradient(from 210deg,
                                    oklch(0.9 0.07 85),
                                    oklch(0.72 0.09 70),
                                    oklch(0.95 0.05 90),
                                    oklch(0.8 0.09 80),
                                    oklch(0.9 0.07 85))`,
                boxShadow: "0 0 44px oklch(0.85 0.09 82 / 0.35)",
                // 12rpm, five seconds a revolution.
                animation: "discSpin 5s linear infinite",
              }}
            />
          </div>
          {/* Label and spindle, so it reads as a record rather than a spinner.
              Sized off a real 7": the label is about a third of the diameter. */}
          <div
            className="absolute inset-[33%] rounded-full"
            style={{ background: "oklch(0.19 0.015 66)" }}
          />
          <div
            className="absolute inset-[47.5%] rounded-full"
            style={{ background: "#060504" }}
          />
        </div>

        <div className="mt-[88px]">
          <h2
            id="welcome-title"
            className="heading text-3xl"
            style={{
              animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 240ms both",
            }}
          >
            {/* Two lines by construction: a short name would otherwise sit on
                one line and lose the shape entirely. */}
            Welcome
            <br />
            {displayName}
          </h2>
          <p
            className="mt-8 text-sm text-ink"
            style={{
              animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 420ms both",
            }}
          >
            Your shelf is live: <span className="text-accent">@{handle}</span>
          </p>
        </div>

        {/* A real button, not a caption: the only way out for anyone not using a
            pointer, one Tab from where focus starts. */}
        <button
          type="button"
          onClick={dismiss}
          className="btn-ghost mt-[34px] !px-8 !py-3 !text-sm"
          style={{
            animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 700ms both",
          }}
        >
          Tap to continue
        </button>

        {/* At the foot rather than in the centred stack, so it reads as the
            product signing the moment rather than another line of the card. */}
        <span
          className="wordmark absolute bottom-6"
          style={{
            animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 900ms both",
          }}
        >
          SpindlShare
        </span>
      </div>
    </dialog>
  );
}
