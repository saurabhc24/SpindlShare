"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { validateUsername } from "@/lib/username";

import { checkAvailability, setClaim, useClaim } from "./claim-store";
import styles from "./landing.module.css";

const DEBOUNCE_MS = 400;

type Answer = { normalized: string; available: boolean | null; message?: string };

/**
 * Both copies share one value, so the name follows the visitor down the page and on to
 * /signup, the original landing page, where signing in happens.
 */
export function ClaimForm({ id, light = false }: { id: string; light?: boolean }) {
  const router = useRouter();
  const raw = useClaim();
  const input = useRef<HTMLInputElement>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const trimmed = raw.trim();
  const validation = trimmed ? validateUsername(trimmed) : null;
  const normalized = validation?.ok ? validation.normalized : null;

  useEffect(() => {
    if (!normalized) return;
    let current = true;
    const timer = window.setTimeout(async () => {
      const result = await checkAvailability(normalized);
      if (!current) return;
      setAnswer(
        result === "error"
          ? { normalized, available: null }
          : { normalized, available: result.available, message: result.message }
      );
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [normalized]);

  const known = answer && answer.normalized === normalized ? answer : null;

  let tone: "ok" | "bad" | undefined;
  let status = "";
  if (!trimmed) {
    status = "";
  } else if (validation && !validation.ok) {
    status = validation.message;
    tone = "bad";
  } else if (!known) {
    status = "Checking…";
  } else if (known.available === false) {
    status = known.message ?? "That name is taken.";
    tone = "bad";
  } else if (known.available) {
    status = `spindlshare.com/${normalized} is free.`;
    tone = "ok";
  }

  // No name yet is fine, it can be picked after signing in. A name that can’t work is not.
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if ((validation && !validation.ok) || known?.available === false) {
      input.current?.focus();
      return;
    }
    router.push("/signup");
  };

  return (
    <form action="/signup" onSubmit={onSubmit} className={light ? styles.claimLight : undefined} noValidate>
      <div className={styles.claim}>
        <label htmlFor={id} className={styles.claimField}>
          <span className={styles.claimPrefix}>spindlshare.com/</span>
          <input
            ref={input}
            id={id}
            className={styles.claimInput}
            value={raw}
            onChange={(event) => setClaim(event.target.value)}
            placeholder="yourname"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-label="The name for your link"
            aria-describedby={`${id}-status`}
            aria-invalid={tone === "bad" || undefined}
          />
        </label>
        <button type="submit" className={styles.pill}>
          Claim your link
        </button>
      </div>
      <p id={`${id}-status`} className={styles.claimStatus} data-tone={tone} aria-live="polite">
        {tone === "ok" && <span aria-hidden="true">✓</span>}
        {status}
      </p>
    </form>
  );
}
