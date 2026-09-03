"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  deleteAccount,
  restoreAccount,
  suspendProfile,
  unsuspendProfile,
  type AdminActionState,
} from "./actions";

export type AdminProfile = {
  id: string;
  username: string;
  usernameNormalized: string;
  displayName: string | null;
  email: string | null;
  isPublic: boolean;
  deletedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  playlistCount: number;
  connectionCount: number;
  createdAt: string;
};

const PILL = "rounded-[4px] border px-3 py-1 text-[10px] whitespace-nowrap";
const ACTION_BUTTON =
  "flex items-center justify-center rounded-[8px] px-3 py-3 text-sm font-bold text-nowrap transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:px-6";
const SMALL_FIELD =
  "w-full rounded-[8px] border border-[#333] bg-transparent px-3 py-2 text-xs font-medium text-white outline-none transition-colors placeholder:text-[#68625a] focus:border-[var(--accent)]";

export function ProfileRow({ profile }: { profile: AdminProfile }) {
  const [suspendState, suspendAction, suspendPending] = useActionState<
    AdminActionState,
    FormData
  >(profile.suspendedAt ? unsuspendProfile : suspendProfile, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState<
    AdminActionState,
    FormData
  >(deleteAccount, undefined);
  const [restoreState, restoreAction, restorePending] = useActionState<
    AdminActionState,
    FormData
  >(restoreAccount, undefined);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const suspended = Boolean(profile.suspendedAt);
  const deleted = Boolean(profile.deletedAt);
  const message = suspendState ?? deleteState ?? restoreState;

  return (
    <li className="flex flex-col justify-center gap-2 rounded-[8px] bg-surface-raised p-6">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/${profile.usernameNormalized}`}
          className="min-w-0 truncate text-base font-bold text-[#c8c8c8] transition-colors hover:text-white"
        >
          /{profile.usernameNormalized}
        </Link>
        <Status
          deleted={deleted}
          suspended={suspended}
          isPublic={profile.isPublic}
        />
      </div>

      <div className="flex flex-col gap-0.5 text-sm font-light text-[#c8c8c8]">
        <p className="truncate">{profile.displayName ?? "(no display name)"}</p>
        <p className="truncate">{profile.email ?? "no email"}</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Figure value={String(profile.playlistCount)} label="PLAYLISTS" />
        <Figure
          value={formatJoined(profile.createdAt, "long")}
          shortValue={formatJoined(profile.createdAt, "short")}
          label="JOINED"
        />
      </div>

      {profile.suspendedReason && (
        <p className="text-xs text-[var(--warn)]">
          Reason: {profile.suspendedReason}
        </p>
      )}

      {/* A deleted account offers one action. Suspending or re-deleting it is
          meaningless while it is already invisible and signed out. */}
      {deleted ? (
        <form action={restoreAction}>
          <input type="hidden" name="profileId" value={profile.id} />
          <button
            type="submit"
            disabled={restorePending}
            className={`${ACTION_BUTTON} w-full border-2 border-[oklch(0.5_0.1_155_/_0.5)] text-[var(--ok)]`}
          >
            {restorePending ? "Restoring..." : "Restore account"}
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <form action={suspendAction} className="col-span-2">
            <input type="hidden" name="profileId" value={profile.id} />
            {/* Optional, and only when suspending -- lifting a suspension needs
                no reason, and the design has no room for a field that is usually
                left blank. */}
            {!suspended && (
              <input
                name="reason"
                placeholder="Reason (optional)"
                maxLength={280}
                className={`${SMALL_FIELD} mb-2`}
              />
            )}
            <button
              type="submit"
              disabled={suspendPending}
              className={`${ACTION_BUTTON} w-full border-2 ${
                suspended
                  ? "border-[oklch(0.5_0.1_155_/_0.5)] text-[var(--ok)]"
                  : "border-[oklch(0.55_0.1_75_/_0.5)] text-[var(--warn)]"
              }`}
            >
              {suspendPending
                ? "Working..."
                : suspended
                  ? "Reinstate account"
                  : "Suspend account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setConfirmingDelete((open) => !open)}
            aria-expanded={confirmingDelete}
            className={`${ACTION_BUTTON} h-fit self-end border-2 border-transparent text-white`}
            style={{ background: "var(--danger)" }}
          >
            Delete
          </button>
        </div>
      )}

      {confirmingDelete && !deleted && (
        <form action={deleteAction} className="note note-error mt-1 !p-3">
          <input type="hidden" name="profileId" value={profile.id} />
          <p className="text-xs">
            Signs the account out, takes its page down and frees its email
            address. Playlists are kept, and this can be undone from here. Type{" "}
            <span className="font-medium text-white">
              {profile.usernameNormalized}
            </span>{" "}
            to confirm.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              name="confirmUsername"
              autoComplete="off"
              placeholder="Username"
              className={`${SMALL_FIELD} flex-1`}
            />
            <input
              name="reason"
              placeholder="Reason (optional)"
              maxLength={280}
              className={`${SMALL_FIELD} flex-1`}
            />
            <button
              type="submit"
              disabled={deletePending}
              className={`${ACTION_BUTTON} shrink-0 text-white`}
              style={{ background: "var(--danger)" }}
            >
              {deletePending ? "Deleting..." : "Delete account"}
            </button>
          </div>
        </form>
      )}

      {(message?.error || message?.success) && (
        <p
          role="status"
          className={`text-xs ${
            message.error ? "text-[var(--danger)]" : "text-[var(--ok)]"
          }`}
        >
          {message.error ?? message.success}
        </p>
      )}
    </li>
  );
}

function Status({
  deleted,
  suspended,
  isPublic,
}: {
  deleted: boolean;
  suspended: boolean;
  isPublic: boolean;
}) {
  if (deleted) {
    return (
      <span
        className={`${PILL} border-[oklch(0.5_0.12_25_/_0.5)] bg-[rgba(225,89,85,0.2)] text-xs text-white`}
      >
        •Deleted
      </span>
    );
  }
  if (suspended) {
    return (
      <span
        className={`${PILL} border-[oklch(0.55_0.1_75_/_0.5)] bg-[rgba(249,226,176,0.1)] text-xs text-accent`}
      >
        •Suspended
      </span>
    );
  }
  // Private is not a moderation state, but it explains an empty public page, so
  // it stays visible rather than being folded into "Active".
  if (!isPublic) {
    return (
      <span className={`${PILL} border-[#333] bg-transparent text-xs text-[#c8c8c8]`}>
        •Private
      </span>
    );
  }
  return (
    <span
      className={`${PILL} border-[#40cf7d] bg-[rgba(64,207,125,0.1)] font-light text-[var(--ok)]`}
    >
      •Active
    </span>
  );
}

/** Below 360px "June 12, 2026" does not fit, so the short form takes over. */
function Figure({
  value,
  shortValue,
  label,
}: {
  value: string;
  shortValue?: string;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 rounded-[8px] px-2 py-5 sm:px-5">
      <p className="text-base leading-none font-bold text-nowrap text-white">
        {shortValue ? (
          <>
            <span className="hidden min-[360px]:inline">{value}</span>
            <span className="min-[360px]:hidden">{shortValue}</span>
          </>
        ) : (
          value
        )}
      </p>
      <p className="text-xs font-medium text-[#c8c8c8]">{label}</p>
    </div>
  );
}

function formatJoined(iso: string, month: "long" | "short"): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month,
    day: "numeric",
    year: "numeric",
  });
}
