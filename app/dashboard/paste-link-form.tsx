"use client";

import { useActionState } from "react";

import { addPlaylistLink, type AddLinkState } from "./playlists/actions";

/**
 * The paste-a-link row, shared by the first-run screen and the playlist board.
 * It carries its own result note, since both callers put it in the same place.
 */
export function PasteLinkForm() {
  const [state, action, pending] = useActionState<AddLinkState, FormData>(
    addPlaylistLink,
    undefined
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <form action={action} className="flex w-full items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-surface-raised p-3">
          <input
            name="url"
            type="url"
            required
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a playlist link"
            aria-label="Paste a playlist link"
            className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-ink-dim"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          aria-label="Import this link"
          className="grid size-[35px] shrink-0 cursor-pointer place-items-center rounded-full transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
          style={{ background: "var(--gold)" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="#151210"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </form>

      {state?.error && (
        <p role="alert" className="note note-error w-full">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="note note-ok w-full">
          {state.success}
        </p>
      )}
    </div>
  );
}
