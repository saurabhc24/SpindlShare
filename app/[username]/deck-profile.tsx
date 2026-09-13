"use client";

import { useState } from "react";

import { Arc } from "./arc";
import { Deck } from "./deck";
import type { ShowcaseItem } from "./playlist-item";

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
  layout,
}: {
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  items: ShowcaseItem[];
  shareUrl: string;
  shareDisplay: string;
  /** The owner's choice from Settings. The chrome is the same either way. */
  layout: "stacked" | "arc";
}) {
  // Tracks are summed from what each playlist reports. A provider that gives no
  // count contributes nothing rather than breaking the line, so the total is
  // omitted entirely when nothing reported one.
  const trackTotal = items.reduce((sum, item) => sum + (item.trackCount ?? 0), 0);
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
      {layout === "arc" ? <Arc items={items} /> : <Deck items={items} />}

      {/* pointer-events-none so the deck stays draggable underneath; the button
          re-enables them for itself. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[2000] flex items-start gap-3 p-6">
        <span className="relative block size-8 shrink-0 overflow-hidden rounded-full bg-[var(--panel-solid)] ring-1 ring-white/10">
          {avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={avatarUrl}
              alt=""
              width={32}
              height={32}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-xs font-medium text-accent">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <span className="truncate text-sm font-medium text-white">
            {handle.replace(/^@/, "")}
          </span>
          <span className="truncate text-xs text-[#c8c8c8]">
            {count} {count === 1 ? "playlist" : "playlists"}
            {trackTotal > 0 && ` · ${trackTotal} tracks`}
          </span>
        </span>

        <button
          type="button"
          onClick={share}
          className="pointer-events-auto shrink-0 cursor-pointer rounded-[8px] px-4 py-3 text-sm font-bold text-[#313131] transition-transform hover:-translate-y-px"
          style={{ background: "var(--gold)", boxShadow: "var(--gold-shadow)" }}
        >
          {copied ? "Copied" : "Share"}
        </button>
      </header>

      {bio && (
        <p className="pointer-events-none absolute inset-x-0 top-[88px] z-[2000] px-6 text-xs leading-relaxed text-[#c8c8c8]">
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
