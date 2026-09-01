"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
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

import { PasteLinkForm } from "./paste-link-form";

export type PlaylistRow = {
  id: string;
  title: string;
  provider: MusicProvider;
  coverImageUrl: string | null;
  visible: boolean;
};

/** The service whose first import failed, so the error can offer a way out. */
export type RetryProvider = { slug: string; label: string };

const WRITE_DEBOUNCE_MS = 400;
/** How long the handle is held before the card reads as picked up. */
const HOLD_MS = 400;

const SOURCE = {
  SPOTIFY: { label: "Spotify", icon: "/Spotify_icon.svg", w: 14, h: 14 },
  YOUTUBE: { label: "YouTube", icon: "/YouTube_icon.svg", w: 14, h: 14 },
  AMAZON: { label: "Playlist", icon: "/Link_icon.svg", w: 14, h: 14 },
  OTHER: { label: "Playlist", icon: "/Link_icon.svg", w: 14, h: 14 },
} as const;

export function PlaylistBoard({
  initial,
  connectError,
  retryProvider,
}: {
  initial: PlaylistRow[];
  /** An OAuth round trip can land back here; this screen has the only slot for it. */
  connectError?: string | null;
  retryProvider?: RetryProvider | null;
}) {
  const [rows, setRows] = useState(initial);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [lastInitial, setLastInitial] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Adding a link revalidates on the server, so the new list arrives as a fresh
  // `initial`. Adjusted during render rather than in an effect, which would
  // paint the stale list first and cascade a second render.
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setRows(initial);
  }
  const pendingWrites = useRef(new Map<string, ReturnType<typeof setTimeout>>());

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
    setDraggingId(null);
    setHeldId(null);
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

  // The account is already connected, so this re-runs the import rather than
  // sending anyone back through an authorization that already succeeded.
  async function retryImport(slug: string) {
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(`/api/sync/${slug}`, { method: "POST" });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        window.location.reload();
        return;
      }
      setError(data?.error ?? "The import failed again. Please try later.");
    } catch {
      setError("Couldn't reach the service. Please try again.");
    } finally {
      setRetrying(false);
    }
  }

  // Held long enough, or already moving -- whichever comes first picks it up.
  const liftedId = draggingId ?? heldId;
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

      <PasteLinkForm />

      {(error || connectError) && (
        <div role="alert" className="note note-error w-full">
          <p>{error ?? connectError}</p>
          {/* The connection is fine, so neither route re-authorizes by default:
              one re-runs the read, the other is for when the browser is signed
              in to the wrong account at that service. */}
          {retryProvider && (
            <span className="mt-3 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => retryImport(retryProvider.slug)}
                disabled={retrying}
                className="cursor-pointer font-semibold text-white underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {retrying ? "Trying again..." : "Try the import again"}
              </button>
              <a
                href={`/api/connect/${retryProvider.slug}?switch=1`}
                className="font-semibold text-white underline underline-offset-4"
              >
                Use a different {retryProvider.label} account
              </a>
            </span>
          )}
        </div>
      )}
      <div className="flex w-full flex-col items-center gap-4">
        <p className="w-full text-sm font-extrabold text-white">
          Chosen {chosen} out of {rows.length}
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setDraggingId(null);
            setHeldId(null);
          }}
        >
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex w-full list-none flex-col gap-4 p-0">
              {rows.map((row) => (
                <PlaylistItem
                  key={row.id}
                  row={row}
                  onToggle={toggleVisibility}
                  lifted={liftedId === row.id}
                  recede={liftedId !== null && liftedId !== row.id}
                  onHold={setHeldId}
                />
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
  recede,
  lifted,
  onHold,
}: {
  row: PlaylistRow;
  onToggle: (id: string, visible: boolean) => void;
  /** Another row is picked up, so this one steps back out of the way. */
  recede: boolean;
  /** Held long enough to have been picked up, or being dragged. */
  lifted: boolean;
  onHold: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const source = SOURCE[row.provider] ?? SOURCE.OTHER;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    releaseRef.current?.();
  };
  useEffect(() => clearHold, []);

  // Runs alongside dnd-kit rather than instead of it: its own onPointerDown is
  // called first, so the 5px-to-drag behaviour is unchanged.
  const beginHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    listeners?.onPointerDown?.(event);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    releaseRef.current?.();
    holdTimer.current = setTimeout(() => onHold(row.id), HOLD_MS);

    // On window, not on the handle: lifting the card slides the handle out from
    // under the pointer, so its own pointerup would never arrive.
    const release = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      releaseRef.current = null;
      onHold(null);
    };
    releaseRef.current = release;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  };

  return (
    /* The li keeps dnd-kit's transform so the drag tracks the pointer exactly;
       the lift lives on the card inside, where it can ease without fighting it. */
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: recede ? 0.7 : 1,
        zIndex: lifted ? 10 : undefined,
        position: lifted ? "relative" : undefined,
      }}
      className="w-full transition-opacity duration-150 ease-out"
    >
      <div
        className="flex w-full items-center justify-between overflow-hidden rounded-lg bg-surface-raised px-3 py-4 transition-transform duration-150 ease-out"
        style={{ transform: lifted ? "scale(1.1)" : undefined }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* The handle alone starts a drag, so the switch stays clickable. */}
          <button
            type="button"
            aria-label={`Reorder ${row.title}`}
            className="shrink-0 cursor-grab touch-none text-[#c8c8c8] active:cursor-grabbing"
            {...attributes}
            {...listeners}
            onPointerDown={beginHold}
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
      </div>
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
