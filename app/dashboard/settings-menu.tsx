"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The gear in the header. It holds sign-out today and is where the rest of the
 * settings will land; the form itself stays on the server, passed in as children.
 */
export function SettingsMenu({ children }: { children: React.ReactNode }) {
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
          className="absolute right-0 top-full z-20 mt-3 min-w-[176px] rounded-[12px] border border-[var(--line)] bg-[var(--panel-solid)] p-1.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}
