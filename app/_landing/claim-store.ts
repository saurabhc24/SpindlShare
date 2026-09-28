import { useSyncExternalStore } from "react";

import { normalizeUsername } from "@/lib/username";

/** Also read by the onboarding form, so a name typed here survives the Google round trip. */
export const CLAIM_KEY = "spindl:claim";

let current: string | null = null;
const listeners = new Set<() => void>();

function read(): string {
  if (current === null) {
    try {
      current = sessionStorage.getItem(CLAIM_KEY) ?? "";
    } catch {
      current = "";
    }
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setClaim(value: string) {
  current = value;
  try {
    if (value) sessionStorage.setItem(CLAIM_KEY, value);
    else sessionStorage.removeItem(CLAIM_KEY);
  } catch {
    // Storage can be refused; the page still works, the name just won't carry over.
  }
  listeners.forEach((listener) => listener());
}

/** The raw text in the claim field, shared by every copy of it on the page. */
export function useClaim(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

/** The name as it would read in the link, or a stand-in until there is one. */
export function useClaimSlug(): string {
  return normalizeUsername(useClaim()) || "yourname";
}

type Availability = { available: boolean; message?: string } | "error";
const answers = new Map<string, Promise<Availability>>();

/** One request per name however many fields ask, since both claim boxes share the text. */
export function checkAvailability(normalized: string): Promise<Availability> {
  let answer = answers.get(normalized);
  if (!answer) {
    answer = fetch(`/api/username/available?u=${encodeURIComponent(normalized)}`)
      .then((response) => (response.ok ? response.json() : "error"))
      .catch(() => "error" as const)
      .then((result: Availability) => {
        // A refusal (rate limit, network) is not an answer, so the next keystroke asks again.
        if (result === "error") answers.delete(normalized);
        return result;
      });
    answers.set(normalized, answer);
  }
  return answer;
}
