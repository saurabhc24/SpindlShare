"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { MusicProvider } from "@/app/generated/prisma/enums";

import { addPlaylistLink, type AddLinkState } from "./playlists/actions";

export type PlaylistRow = {
  id: string;
  title: string;
  provider: MusicProvider;
  coverImageUrl: string | null;
  visible: boolean;
};

export type MissingService = {
  provider: "SPOTIFY" | "YOUTUBE";
  slug: string;
  label: string;
};

const WRITE_DEBOUNCE_MS = 400;

const SOURCE = {
  SPOTIFY: { label: "Spotify", icon: "/Spotify_icon.svg", w: 14, h: 14 },
  YOUTUBE: { label: "YouTube", icon: "/YouTube_icon.svg", w: 14, h: 14 },
  AMAZON: { label: "Playlist", icon: "/Link_icon.svg", w: 14, h: 14 },
  OTHER: { label: "Playlist", icon: "/Link_icon.svg", w: 14, h: 14 },
} as const;

export function PlaylistBoard({
  initial,
  missing,
  connectError,
}: {
  initial: PlaylistRow[];
  missing: MissingService[];
  /** An OAuth round trip can land back here; this screen has the only slot for it. */
  connectError?: string | null;
}) {
  const [rows, setRows] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Adding a link revalidates on the server, so the new list arrives as a fresh
  // `initial`. Adjusted during render rather than in an effect, which would
  // paint the stale list first and cascade a second render.
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setRows(initial);
  }
  const pendingWrites = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [linkState, linkAction, linkPending] = useActionState<AddLinkState, FormData>(
    addPlaylistLink,
    undefined
  );

  useEffect(() => {
    const timers = pendingWrites.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = rows;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    setRows(reordered);
    setError(null);

    try {
      const response = await fetch("/api/playlists/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((r) => r.id) }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // Roll back so the list never claims an order the server didn't accept.
      setRows(previous);
      setError("Couldn't save the new order. Please try again.");
    }
  }

  function toggleVisibility(id: string, visible: boolean) {
    const previous = rows;
    setRows((all) => all.map((r) => (r.id === id ? { ...r, visible } : r)));
    setError(null);

    // The switch flips at once but the write waits: flicking it back and forth
    // collapses into one request per playlist rather than one per click.
    const existing = pendingWrites.current.get(id);
    if (existing) clearTimeout(existing);
    pendingWrites.current.set(
      id,
      setTimeout(async () => {
        pendingWrites.current.delete(id);
        try {
          const response = await fetch(`/api/playlists/${id}/visibility`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visible }),
          });
          if (!response.ok) {
            setRows(previous);
            setError(
              response.status === 429
                ? "You're making changes very quickly. Please wait a moment."
                : "Couldn't update that playlist. Please try again."
            );
          }
        } catch {
          setRows(previous);
          setError("Couldn't update that playlist. Please try again.");
        }
      }, WRITE_DEBOUNCE_MS)
    );
  }

  const chosen = rows.filter((r) => r.visible).length;

  return (
    <main className="flex w-full flex-1 flex-col items-center gap-6 py-9">
      <div className="flex w-full flex-col gap-3">
        <h1 className="heading text-[20px] text-white">Playlists</h1>
        <p className="text-sm text-[#c8c8c8]">
          Toggle which playlist appears on your public page. Drag to set the order
          they appear in.
        </p>
      </div>

      <div className="flex w-full flex-col items-start justify-center gap-4">
        <form action={linkAction} className="flex w-full items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg bg-surface-raised p-3">
            <input
              name="url"
              type="url"
              required
              inputMode="url"
              autoComplete="off"
              placeholder="Paste a playlist link"
              aria-label="Paste a playlist link"
              className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-[#c8c8c8]"
            />
          </div>
          <button
            type="submit"
            disabled={linkPending}
            aria-label="Import this link"
            className="grid size-[35px] shrink-0 cursor-pointer place-items-center rounded-full transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            style={{ background: "var(--gold)" }}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="#151210" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </form>

        {missing.map((service) => (
          <a
            key={service.provider}
            href={`/api/connect/${service.slug}`}
            className="flex w-full items-center justify-center gap-3 overflow-hidden rounded-lg bg-surface-raised p-3 transition-colors hover:brightness-125"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SOURCE[service.provider].icon}
              alt=""
              width={16}
              height={16}
              className="size-4 object-contain"
            />
            <span className="text-sm font-medium text-white">
              Import from {service.label}
            </span>
          </a>
        ))}
      </div>

      {(linkState?.error || error || connectError) && (
        <p role="alert" className="note note-error w-full">
          {linkState?.error ?? error ?? connectError}
        </p>
      )}
      {linkState?.success && (
        <p role="status" className="note note-ok w-full">
          {linkState.success}
        </p>
      )}

      <div className="flex w-full flex-col items-center gap-4">
        <p className="w-full text-sm font-extrabold text-white">
          Chosen {chosen} out of {rows.length}
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex w-full list-none flex-col gap-4 p-0">
              {rows.map((row) => (
                <PlaylistItem key={row.id} row={row} onToggle={toggleVisibility} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </main>
  );
}

function PlaylistItem({
  row,
  onToggle,
}: {
  row: PlaylistRow;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const source = SOURCE[row.provider] ?? SOURCE.OTHER;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex w-full items-center justify-between overflow-hidden rounded-lg bg-surface-raised px-3 py-4 ${
        isDragging ? "relative z-10 opacity-90" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* The handle alone starts a drag, so the switch stays clickable. */}
        <button
          type="button"
          aria-label={`Reorder ${row.title}`}
          className="shrink-0 cursor-grab touch-none text-[#c8c8c8] active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
            <circle cx="1.25" cy="1.25" r="1.25" />
            <circle cx="6.75" cy="1.25" r="1.25" />
            <circle cx="1.25" cy="5" r="1.25" />
            <circle cx="6.75" cy="5" r="1.25" />
            <circle cx="1.25" cy="8.75" r="1.25" />
            <circle cx="6.75" cy="8.75" r="1.25" />
          </svg>
        </button>

        <div className="flex min-w-0 items-center gap-3">
          <span className="block size-[53px] shrink-0 overflow-hidden rounded-lg bg-white">
            {row.coverImageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={row.coverImageUrl}
                alt=""
                width={53}
                height={53}
                className="size-full object-cover"
              />
            ) : null}
          </span>

          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-extrabold text-white">{row.title}</p>
            <div className="flex items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={source.icon}
                alt=""
                width={source.w}
                height={source.h}
                className="shrink-0 object-contain"
              />
              <span className="text-[10px] font-light text-[#c8c8c8]">
                {source.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Toggle
        on={row.visible}
        label={`Show ${row.title} on your page`}
        onChange={(next) => onToggle(row.id, next)}
      />
    </li>
  );
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-[14px] w-6 shrink-0 cursor-pointer rounded-[200px] border border-white transition-colors"
      style={{ background: on ? "var(--ok)" : "var(--ink-dim)" }}
    >
      <span
        className="absolute top-px block size-[10px] rounded-full bg-white transition-all"
        style={{ left: on ? 11 : 1 }}
      />
    </button>
  );
}
