import Link from "next/link";

import { requireProfile } from "@/lib/dal";

import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { profile } = await requireProfile();

  return (
    <div className="flex flex-1 flex-col bg-[#150e07]">
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-9 px-6 pt-8 pb-6">
        <header className="flex w-full items-center justify-between gap-4">
          <Link
            href={`/${profile.username}`}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--panel-solid)]">
              {profile.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={profile.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-medium text-accent">
                  {profile.username.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="truncate text-sm font-medium text-white transition-colors group-hover:text-accent">
              {profile.username}
            </span>
          </Link>

          {/* The gear opened this page, so the way back is home rather than a
              second gear pointing at where you already are. */}
          <Link
            href="/dashboard"
            aria-label="Back to your playlists"
            className="block size-[26px] shrink-0 transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home_icon.svg" alt="" width={26} height={26} />
          </Link>
        </header>

        <main className="flex w-full flex-col items-center gap-6">
          <div className="flex w-full flex-col gap-3">
            <h1 className="heading text-[20px] text-white">Settings</h1>
            <p className="text-sm text-[#c8c8c8]">
              Set up how your page introduces you
            </p>
          </div>

          <SettingsForm
            displayName={profile.displayName ?? ""}
            bio={profile.bio ?? ""}
            isPublic={profile.isPublic}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
        </main>

        <footer className="flex w-full items-center justify-center p-1">
          <span className="wordmark text-white">SpindlShare</span>
        </footer>
      </div>
    </div>
  );
}
