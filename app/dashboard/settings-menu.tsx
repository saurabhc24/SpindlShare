"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** Shared so the sign-out form, passed in as children, matches the links here. */
export const MENU_ITEM_CLASS =
  "block w-full cursor-pointer rounded-[8px] px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-[#c8c8c8] transition-colors hover:bg-surface-raised hover:text-white";

/**
 * The gear in the header. Sign-out stays on the server and arrives as children;
 * Admin only renders for an admin, matching the 404 the route itself gives.
 */
export function SettingsMenu({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        className="block size-[26px] cursor-pointer transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/setting_icon.svg" alt="" width={26} height={26} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-3 flex min-w-[176px] flex-col gap-0.5 rounded-[12px] border border-[var(--line)] bg-[var(--panel-solid)] p-1.5"
        >
          {isAdmin && (
            <Link
              href="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={MENU_ITEM_CLASS}
            >
              Admin
            </Link>
          )}
          <Link
            href="/dashboard/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={MENU_ITEM_CLASS}
          >
            Settings
          </Link>
          {children}
        </div>
      )}
    </div>
  );
}
