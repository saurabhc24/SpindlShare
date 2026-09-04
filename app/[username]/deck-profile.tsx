"use client";

import { useState } from "react";

import { Deck } from "./deck";
import type { ShowcaseItem } from "./showcase";

/**
 * The public profile: who this is, over a deck of their playlists.
 *
 * The deck owns the whole viewport and the chrome floats above it, because the
 * deck is scrolled through rather than scrolled past -- a header in normal flow
 * would push it down and leave the stack cropped.
 */
export function DeckProfile({
  displayName,
  handle,
  avatarUrl,
  bio,
  items,
  shareUrl,
  shareDisplay,
}: {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  items: ShowcaseItem[];
  shareUrl: string;
  shareDisplay: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard needs a secure context and permission. The URL is in the
      // footer either way, so there is nothing to recover from.
    }
  }

  const count = items.length;

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 70% at 50% -10%, oklch(0.24 0.02 70) 0%, oklch(0.15 0.015 65) 34%, #060504 78%)",
      }}
    >
      <Deck items={items} />

      {/* pointer-events-none so the deck stays draggable underneath; the button
          re-enables them for itself. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[2000] flex items-start gap-3 p-6">
        <span className="relative block size-14 shrink-0 overflow-hidden rounded-full bg-[var(--panel-solid)] ring-1 ring-white/10">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt=""
              width={56}
              height={56}
              className="size-full object-cover"
            />
          ) : (
            <span className="display flex size-full items-center justify-center text-2xl text-white">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="heading truncate text-[22px] leading-none text-white">
            {displayName}
          </h1>
          <span className="flex items-center gap-2 text-xs text-[#c8c8c8]">
            <span className="truncate text-accent">{handle}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">
              {count} {count === 1 ? "playlist" : "playlists"}
            </span>
          </span>
        </span>

        <button
          type="button"
          onClick={share}
          className="pointer-events-auto shrink-0 cursor-pointer rounded-full px-4 py-2.5 text-xs font-bold text-[#151210] transition-transform hover:-translate-y-px"
          style={{ background: "var(--gold)", boxShadow: "var(--gold-shadow)" }}
        >
          {copied ? "Copied" : "Share"}
        </button>
      </header>

      {bio && (
        <p className="pointer-events-none absolute inset-x-0 top-[104px] z-[2000] px-6 text-xs leading-relaxed text-[#c8c8c8]">
          {bio}
        </p>
      )}

      {/* The scroll hint and the address. Both sit clear of the deck's run,
          which reaches the lower-left corner. */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-[2000] flex flex-col items-center gap-2 p-6">
        <span className="text-[11px] text-[#68625a]">{shareDisplay}</span>
        <span className="wordmark text-sm text-white">SpindlShare</span>
      </footer>
    </div>
  );
}
