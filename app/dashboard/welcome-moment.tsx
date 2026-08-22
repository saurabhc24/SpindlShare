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
      {/* Clipped: the record's glow is drawn wider than a phone, and is the one
          thing here that could put a scrollbar on the page. */}
      <div className="flex h-full flex-col items-center justify-between overflow-hidden px-6 py-8">
        <div className="flex flex-col items-center gap-9 py-10">
          <GoldenRecord />

          <div className="flex flex-col items-center gap-9">
            <div className="flex flex-col items-center gap-9">
              {/* Two lines by construction: a short name would otherwise sit on
                  one line and lose the shape entirely. */}
              <h2
                id="welcome-title"
                className="flex flex-col gap-2.5 text-center"
                style={{
                  animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 240ms both",
                }}
              >
                <span className="heading text-[clamp(26px,8.15vw,32px)] leading-[1.16] text-white">
                  Welcome
                </span>
                <span className="heading text-[clamp(26px,8.15vw,32px)] leading-[1.16] text-white">
                  {displayName}
                </span>
              </h2>

              <p
                className="flex items-center gap-1 text-base font-medium"
                style={{
                  animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 420ms both",
                }}
              >
                <span className="text-white">Your shelf is live:</span>
                <span className="text-[#d0b583]">@{handle}</span>
              </p>
            </div>

            {/* Its own colours rather than .btn-ghost's: the design sets it
                darker than the page, which is the opposite of what that does. */}
            <button
              type="button"
              onClick={dismiss}
              className="w-[174px] cursor-pointer rounded-full border border-[#3f3f3f] bg-[#130f0a] px-4 py-3 text-sm font-extrabold text-white transition-colors hover:border-[#5c5c5c]"
              style={{
                animation: "riseIn 620ms cubic-bezier(0.22,1,0.36,1) 700ms both",
              }}
            >
              Tap to continue
            </button>
          </div>
        </div>

        <span
          className="wordmark text-white"
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

/**
 * Inline rather than an <img> so the disc can turn while the glow holds still --
 * the two aren't concentric, and rotating both would swing the halo around.
 */
function GoldenRecord() {
  return (
    <div
      aria-hidden="true"
      className="relative size-[255px] shrink-0"
      style={{ animation: "discArrive 700ms cubic-bezier(0.22,1,0.36,1) both" }}
    >
      {/* The canvas overhangs its 255px box on every side, so the glow spills
          past the disc without pushing the heading down. */}
      <svg
        viewBox="0 0 455 455"
        className="absolute -inset-[100px] size-[455px]"
        fill="none"
      >
        <g filter="url(#record-glow)">
          <circle cx="227.5" cy="227.5" r="127.5" fill="#DFB84D" fillOpacity="0.2" />
        </g>
        <g className="record-face">
          <rect x="158" y="163" width="139" height="139" rx="69.5" fill="url(#record-lacquer)" />
          <circle cx="227.5" cy="232.5" r="62" stroke="#5C5C5C" />
          <circle cx="227.5" cy="232.5" r="55" stroke="#5C5C5C" />
          <circle cx="227.5" cy="232.5" r="48" stroke="#5C5C5C" />
          <circle cx="227.5" cy="232.5" r="41" stroke="#5C5C5C" />
          <circle cx="227.5" cy="232.5" r="34" stroke="#5C5C5C" />
          <circle cx="227.5" cy="232.5" r="22" fill="black" stroke="#5C5C5C" />
        </g>
        <defs>
          <filter
            id="record-glow"
            x="0"
            y="0"
            width="455"
            height="455"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="50" />
          </filter>
          <radialGradient
            id="record-lacquer"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(227.5 232.5) rotate(90) scale(69.5)"
          >
            <stop stopColor="#DCB87A" />
            <stop offset="1" stopColor="#DFC494" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}
