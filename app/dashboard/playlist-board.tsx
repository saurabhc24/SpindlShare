"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
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

/** A connected service, and when its playlists were last read. */
export type Connection = {
  slug: string;
  label: string;
  lastSyncedAt: string | null;
};

/**
 * When the services were last read, phrased for a person. Shows the oldest of
 * them, since that is the one whose songs are furthest out of date.
 *
 * Takes `now` rather than reading the clock: this renders on the server and
 * again on the client, and the two would not agree, which React reports as a
 * hydration mismatch.
 */
function lastSyncedNote(
  connections: Connection[],
  /** Minutes since the epoch, or null on the server. */
  minute: number | null
): string {
  const times = connections
    .map((c) =>
      c.lastSyncedAt ? Math.floor(new Date(c.lastSyncedAt).getTime() / 60_000) : null
    )
    .filter((t): t is number => t !== null && !Number.isNaN(t));
  // Null until the client has mounted, so both passes render the same words.
  if (connections.length === 0) {
    return "Connect a service to bring in songs and new playlists.";
  }
  if (minute === null || times.length === 0) {
    return "Brings in new songs and playlists.";
  }

  const minutes = minute - Math.min(...times);
  if (minutes < 2) return "Last synced just now.";
  if (minutes < 60) return `Last synced ${minutes} minutes ago.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last synced ${hours} ${hours === 1 ? "hour" : "hours"} ago.`;
  const days = Math.floor(hours / 24);
  return `Last synced ${days} ${days === 1 ? "day" : "days"} ago.`;
}

/**
 * The current minute, as an external store. Bucketed so successive snapshots
 * compare equal -- returning Date.now() raw would give React a new value every
 * read and loop forever. The server snapshot is null, so the first paint and
 * the hydration agree and only the client ever shows a relative time.
 */
const subscribeMinute = (onChange: () => void) => {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);
const minuteOnServer = (): number | null => null;

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
  connections,
}: {
  initial: PlaylistRow[];
  /** Connected services, each with its own Sync control. */
  connections: Connection[];
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
  /** Whether a sync is running, and what the last finished one reported. */
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  // The clock, read by the store rather than during render: see lastSyncedNote.
  const minute = useSyncExternalStore(
    subscribeMinute,
    minuteNow,
    minuteOnServer
  );

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

  // The same endpoint as the retry above, but asked for deliberately rather
  // than after a failure -- so it reports what it found instead of reloading.
  //
  // Every connected service in one press: the control is a single icon, and
  // "refresh my playlists" is the thing being asked for, not "refresh Spotify".
  async function syncNow() {
    if (syncing) return;
    // Pasted links belong to no connected account, so there is no token to read
    // their songs with. Connecting is the only thing that helps -- say so.
    if (connections.length === 0) {
      setError(
        "Connect Spotify or YouTube to refresh playlists. Links added by pasting can't be re-read on their own."
      );
      return;
    }
    setSyncing(true);
    setError(null);
    setSyncNote(null);

    let imported = 0;
    let added = 0;
    let songs = 0;
    let failure: string | null = null;

    // Sequential, not parallel: both providers rate-limit per application, so
    // firing them together is the one pattern most likely to trip that.
    for (const connection of connections) {
      try {
        const response = await fetch(`/api/sync/${connection.slug}`, {
          method: "POST",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          failure =
            data?.error ?? `Couldn't sync ${connection.label}. Please try again.`;
          break;
        }
        imported += data?.imported ?? 0;
        added += data?.added ?? 0;
        songs += data?.tracksStored ?? 0;
      } catch {
        failure = "Couldn't reach the service. Please try again.";
        break;
      }
    }

    setSyncing(false);
    if (failure) {
      setError(failure);
      return;
    }

    // Said in terms of what changed, because "Synced" leaves you wondering
    // whether it actually did anything.
    setSyncNote(
      `${imported} ${imported === 1 ? "playlist" : "playlists"}` +
        (added > 0 ? `, ${added} new` : "") +
        `, ${songs} ${songs === 1 ? "song" : "songs"}.`
    );
    // The songs and any new playlists only appear on a fresh render.
    setTimeout(() => window.location.reload(), 1200);
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
        <div className="flex w-full items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-white">
            Chosen {chosen} out of {rows.length}
          </p>

          {/* Always here, so the way to refresh is never hidden. With nothing
              connected there is no token to read a playlist with, so it says
              that rather than vanishing and leaving no explanation. */}
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            aria-label={syncing ? "Syncing playlists" : "Sync playlists"}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/10 disabled:cursor-not-allowed"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Reload_icon.svg"
              alt=""
              width={17}
              height={17}
              className={syncing ? "sync-spin" : undefined}
            />
          </button>
        </div>

        {/* What the last sync found, or when one last ran. The relative time is
            client-only by design, so the two passes differ here and React is
            told not to report it. */}
        <p
          aria-live="polite"
          suppressHydrationWarning
          className="w-full text-xs text-[#68625a]"
        >
          {syncing
            ? "Syncing..."
            : (syncNote ?? lastSyncedNote(connections, minute))}
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
