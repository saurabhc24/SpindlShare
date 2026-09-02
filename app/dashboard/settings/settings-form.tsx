"use client";

import { useActionState, useRef, useState } from "react";

import {
  changeUsername,
  deleteMyAccount,
  updateProfile,
  type ActionState,
} from "./actions";
import { BIO_MAX } from "./limits";

const FIELD =
  "w-full rounded-lg border border-[#333] bg-transparent p-3 text-sm font-medium text-white outline-none transition-colors placeholder:text-[#68625a] focus:border-[var(--accent)]";
const LABEL = "text-sm font-medium text-white";
const NOTE = "text-xs text-[#c8c8c8]";

export function SettingsForm({
  displayName,
  bio,
  isPublic,
  username,
  avatarUrl,
}: {
  displayName: string;
  bio: string;
  isPublic: boolean;
  username: string;
  avatarUrl: string | null;
}) {
  const [profileState, profileAction, profilePending] = useActionState<
    ActionState,
    FormData
  >(updateProfile, undefined);
  const [usernameState, usernameAction, usernamePending] = useActionState<
    ActionState,
    FormData
  >(changeUsername, undefined);
  const [deleteState, deleteAction, deletePending] = useActionState<
    ActionState,
    FormData
  >(deleteMyAccount, undefined);

  const [nameValue, setNameValue] = useState(displayName);
  const [bioValue, setBioValue] = useState(bio);
  const [isPublicValue, setIsPublicValue] = useState(isPublic);
  const [photo, setPhoto] = useState(avatarUrl);
  // Empty by design: the current handle is the placeholder, so the field reads
  // as "type a new one" rather than as text to clear first.
  const [usernameValue, setUsernameValue] = useState("");

  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // A save revalidates, so the saved values come back as new props. Re-syncing
  // here is what returns both buttons to disabled once a change has landed.
  const [saved, setSaved] = useState({ displayName, bio, isPublic, avatarUrl, username });
  if (
    saved.displayName !== displayName ||
    saved.bio !== bio ||
    saved.isPublic !== isPublic ||
    saved.avatarUrl !== avatarUrl ||
    saved.username !== username
  ) {
    setSaved({ displayName, bio, isPublic, avatarUrl, username });
    setNameValue(displayName);
    setBioValue(bio);
    setIsPublicValue(isPublic);
    setPhoto(avatarUrl);
    setUsernameValue("");
  }

  const profileDirty =
    nameValue !== displayName ||
    bioValue !== bio ||
    isPublicValue !== isPublic ||
    (photo ?? "") !== (avatarUrl ?? "");

  // Case-sensitive: the action treats a casing-only edit as a real change, so
  // the button has to offer it.
  const typedUsername = usernameValue.trim();
  const usernameDirty = typedUsername !== "" && typedUsername !== username;

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset at once so picking the same file twice still fires a change event.
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/avatar", { method: "POST", body });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPhotoError(data?.error ?? "Couldn't upload that photo.");
        return;
      }
      setPhoto(data.url);
    } catch {
      setPhotoError("Couldn't upload that photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const openPicker = () => fileInput.current?.click();

  return (
    <div className="flex w-full flex-col gap-6">
      <form action={profileAction} className="flex w-full flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          {/* The picture is the obvious thing to click, so it opens the same
              picker the caption below does. */}
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            aria-label="Change photo"
            className="relative block size-16 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[var(--panel-solid)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {photo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={photo} alt="" width={64} height={64} className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-lg font-medium text-accent">
                {username.charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          {/* accept="image/*" is what makes a phone offer its gallery and camera,
              and a desktop browser filter its file dialog to images. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            className="sr-only"
            aria-label="Choose a profile photo"
          />
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            className="cursor-pointer text-sm font-medium text-[#c8c8c8] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? "Uploading..." : "Change photo"}
          </button>
          {/* Saved with the rest of the form, so abandoning the page changes nothing. */}
          <input type="hidden" name="avatarUrl" value={photo ?? ""} />
        </div>

        {photoError && (
          <p role="alert" className="note note-error w-full">
            {photoError}
          </p>
        )}

        <div className="flex w-full flex-col gap-2">
          <label htmlFor="displayName" className={LABEL}>
            Display Name
          </label>
          <input
            id="displayName"
            name="displayName"
            value={nameValue}
            onChange={(event) => setNameValue(event.target.value)}
            maxLength={50}
            autoComplete="name"
            placeholder="Your name"
            className={FIELD}
          />
        </div>

        <div className="flex w-full flex-col gap-2">
          <label htmlFor="bio" className={LABEL}>
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            value={bioValue}
            onChange={(event) => setBioValue(event.target.value.slice(0, BIO_MAX))}
            maxLength={BIO_MAX}
            rows={3}
            placeholder="A line about you or your playlists..."
            className={`${FIELD} h-[94px] resize-none`}
          />
          <span className="flex items-center justify-end">
            <span className="text-xs font-medium text-[#68625a]" aria-live="polite">
              {bioValue.length}/{BIO_MAX}
            </span>
          </span>
        </div>

        <div className="flex w-full items-start justify-between gap-4">
          <span className="flex flex-col justify-center gap-1">
            <span className={LABEL}>Public Account</span>
            <span className={`${NOTE} max-w-[239px]`}>
              When off, your page returns to &lsquo;not found&rsquo; to visitors
            </span>
          </span>
          {/* The checkbox is the value that submits; the button is what is seen. */}
          <input
            type="checkbox"
            name="isPublic"
            className="sr-only"
            checked={isPublicValue}
            onChange={(event) => setIsPublicValue(event.target.checked)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={isPublicValue}
            aria-label="Public Account"
            onClick={() => setIsPublicValue((v) => !v)}
            className="relative mt-1 h-[14px] w-6 shrink-0 cursor-pointer rounded-[200px] border border-white transition-colors"
            style={{ background: isPublicValue ? "var(--ok)" : "var(--ink-dim)" }}
          >
            <span
              className="absolute top-px block size-[10px] rounded-full bg-white transition-all"
              style={{ left: isPublicValue ? 11 : 1 }}
            />
          </button>
        </div>

        {profileState?.error && (
          <p role="alert" className="note note-error w-full">
            {profileState.error}
          </p>
        )}
        {profileState?.success && (
          <p role="status" className="note note-ok w-full">
            {profileState.success}
          </p>
        )}

        <div className="flex w-full flex-col items-start">
          <button
            type="submit"
            disabled={!profileDirty || profilePending || uploading}
            className="cursor-pointer rounded-lg px-6 py-3 text-sm font-bold text-[#313131] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
            style={{ background: "var(--gold)" }}
          >
            {profilePending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>

      <form action={usernameAction} className="flex w-full flex-col items-center gap-4">
        <div className="flex w-full flex-col gap-2">
          <label htmlFor="username" className={LABEL}>
            Username
          </label>
          <div className="flex w-full items-center gap-1 rounded-lg border border-[#333] p-3 focus-within:border-[var(--accent)]">
            <span className="text-sm font-medium text-accent">@</span>
            <input
              id="username"
              name="username"
              value={usernameValue}
              onChange={(event) => setUsernameValue(event.target.value)}
              placeholder={username}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-transparent text-sm font-medium text-white outline-none placeholder:text-[#68625a]"
            />
          </div>
        </div>

        {usernameState?.error && (
          <p role="alert" className="note note-error w-full">
            {usernameState.error}
          </p>
        )}
        {usernameState?.success && (
          <p role="status" className="note note-ok w-full">
            {usernameState.success}
          </p>
        )}

        <div className="flex w-full flex-col items-start">
          <button
            type="submit"
            disabled={!usernameDirty || usernamePending}
            className="cursor-pointer rounded-lg bg-surface-raised px-6 py-3 text-sm font-bold text-[#c8c8c8] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-[#c8c8c8]"
          >
            {usernamePending ? "Changing..." : "Change username"}
          </button>
        </div>

        <p className={`w-full ${NOTE}`}>
          Changing your username frees the old one for someone else. Existing
          links keep working until it is claimed.
        </p>
      </form>

      <div className="flex w-full flex-col items-center gap-4">
        <p className="w-full text-center text-sm text-white">
          Deleting your account removes your profile and playlists. This
          can&apos;t be undone.
        </p>

        {deleteState?.error && (
          <p role="alert" className="note note-error w-full">
            {deleteState.error}
          </p>
        )}

        {confirmingDelete ? (
          <form action={deleteAction} className="flex w-full flex-col items-center gap-3">
            <label htmlFor="confirmUsername" className={`w-full ${NOTE}`}>
              Type <span className="font-semibold text-white">{username}</span> to
              confirm.
            </label>
            <input
              id="confirmUsername"
              name="confirmUsername"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={FIELD}
            />
            <span className="flex items-center gap-4">
              <button
                type="submit"
                disabled={deletePending}
                className="cursor-pointer rounded-lg px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                style={{ background: "var(--danger)" }}
              >
                {deletePending ? "Deleting..." : "Delete my account"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="cursor-pointer text-sm font-medium text-[#c8c8c8] underline underline-offset-4 hover:text-white"
              >
                Cancel
              </button>
            </span>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="cursor-pointer rounded-lg px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--danger)" }}
          >
            Delete my account
          </button>
        )}
      </div>
    </div>
  );
}
