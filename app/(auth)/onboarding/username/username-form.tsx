"use client";

import { useActionState, useEffect, useState } from "react";

import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from "@/lib/username";

import { claimUsername, type ClaimUsernameState } from "./actions";

// Long enough that typing a name end-to-end sends one request, not one per key.
const DEBOUNCE_MS = 450;

type RemoteResult = {
  /** Which normalized name this answer is about, so a stale reply is ignored. */
  normalized: string;
  status: "available" | "taken" | "error";
  message?: string;
};

export function UsernameForm() {
  const [state, action, pending] = useActionState<ClaimUsernameState, FormData>(
    claimUsername,
    undefined
  );
  const [value, setValue] = useState("");
  const [remote, setRemote] = useState<RemoteResult | null>(null);

  // Everything that can be known without the network is derived during render.
  // Keeping it out of state avoids a setState-in-effect cascade, and means the
  // validation message appears the moment a key is pressed rather than a render
  // later.
  const trimmed = value.trim();
  const validation = trimmed ? validateUsername(trimmed) : null;
  const normalized = validation?.ok ? validation.normalized : null;

  useEffect(() => {
    if (!normalized) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/username/available?u=${encodeURIComponent(normalized)}`,
          { signal: controller.signal }
        );

        if (response.status === 429) {
          setRemote({ normalized, status: "error" });
          return;
        }

        const data = await response.json();
        setRemote({
          normalized,
          status: data.available ? "available" : "taken",
          message: data.message,
        });
      } catch (error) {
        // An aborted request is the expected outcome of typing another key.
        if ((error as Error)?.name === "AbortError") return;
        setRemote({ normalized, status: "error" });
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);

  // An answer only counts if it's for what's currently typed; otherwise we're
  // still waiting on the debounce or the request.
  const current = remote?.normalized === normalized ? remote : null;
  const hint = describe({ trimmed, validation, current });
  const isTaken = current?.status === "taken";

  return (
    <form action={action} className="mt-14">
      <label htmlFor="username" className="block text-base font-medium text-ink">
        Username
      </label>
      <input
        id="username"
        name="username"
        required
        autoFocus
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // Hard stop at the same limit the server enforces, so the field can't
        // accept characters that are only going to be rejected on submit.
        maxLength={USERNAME_MAX_LENGTH}
        // Not type="url" or inputMode="url": that keyboard leads with "/" and
        // ".com", neither of which is legal here.
        inputMode="text"
        placeholder="username"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-describedby="username-hint"
        aria-invalid={isTaken || validation?.ok === false || undefined}
        // Not the shared .field: this one is the page's single subject, so it
        // sits darker and rounder than a field in a row of settings. Room above
        // it for when a browser scrolls it into view for the on-screen keyboard,
        // so it doesn't land flush against the top edge with its label cropped.
        className="mt-3 w-full scroll-mt-24 rounded-[14px] border border-[var(--line)] bg-[oklch(0.11_0.008_66_/_0.86)] px-4 py-3.5 text-base text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-[var(--accent)]"
      />

      {/* Two lines' worth of height reserved whatever it currently says. The
          message swaps between one and two lines as you type, and without this
          the button steps up and down under your thumb while you are aiming
          at it. */}
      <p
        id="username-hint"
        role="status"
        aria-live="polite"
        className={`mt-3 min-h-12 text-sm leading-relaxed ${hint.className}`}
      >
        {state?.error ?? hint.text}
      </p>

      {/* Same type size and height as the landing page's "Claim your link",
          which is the button this one finishes the job of -- it reads as the
          same promise kept rather than as a second, bigger one. Only the width
          differs, because here it is the page's single action. */}
      <button
        type="submit"
        disabled={pending || isTaken}
        className="btn-gold mt-8 w-full !rounded-full !py-3"
      >
        {pending ? "Claiming..." : "Claim your link"}
      </button>
    </form>
  );
}

function describe({
  trimmed,
  validation,
  current,
}: {
  trimmed: string;
  validation: ReturnType<typeof validateUsername> | null;
  current: RemoteResult | null;
}): { text: string; className: string } {
  const muted = "text-ink-faint";

  if (!trimmed || !validation) {
    return {
      text: `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters. Letters, numbers, periods, hyphens, underscores allowed.`,
      className: muted,
    };
  }

  if (!validation.ok) {
    return {
      text: validation.message,
      className: "text-[var(--warn)]",
    };
  }

  if (!current) {
    return { text: "Checking availability...", className: muted };
  }

  switch (current.status) {
    case "available":
      return {
        text: "That one’s free.",
        className: "text-[var(--ok)]",
      };
    case "taken":
      return {
        text: current.message ?? "That username is taken.",
        className: "text-[var(--danger)]",
      };
    default:
      return {
        text: "Couldn't check right now -- you can still submit.",
        className: muted,
      };
  }
}
