import "server-only";

/**
 * Fixed-window rate limiting, backed by Upstash Redis when configured and an
 * in-process map otherwise.
 *
 * The in-process fallback is only correct for a single instance -- on Vercel each
 * serverless instance keeps its own counter, so the effective limit is multiplied
 * by the number of warm instances. That is fine for local dev and better than no
 * limit at all, but production must set UPSTASH_REDIS_REST_URL/TOKEN for limits
 * to actually hold. `rateLimitBackend()` reports which one is live.
 *
 * Implemented against Upstash's REST API with plain fetch rather than pulling in
 * @upstash/ratelimit, since a fixed window is just INCR + EXPIRE.
 */

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfter: number;
};

export type RateLimitRule = {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function rateLimitBackend(): "upstash" | "memory" {
  return UPSTASH_URL && UPSTASH_TOKEN ? "upstash" : "memory";
}

// --- in-process fallback -----------------------------------------------------

type Counter = { count: number; resetAt: number };
const counters = new Map<string, Counter>();

// Keep the map from growing without bound under many distinct keys (e.g. per-IP
// on a busy instance). Cheap because expired entries are the common case.
function sweep(now: number) {
  if (counters.size < 5000) return;
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

function memoryLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = counters.get(key);
  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return {
      ok: true,
      remaining: rule.limit - 1,
      limit: rule.limit,
      retryAfter: rule.windowSeconds,
    };
  }

  existing.count++;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    ok: existing.count <= rule.limit,
    remaining: Math.max(0, rule.limit - existing.count),
    limit: rule.limit,
    retryAfter,
  };
}

// --- Upstash -----------------------------------------------------------------

async function upstashPipeline(
  commands: string[][]
): Promise<Array<{ result?: unknown; error?: string }>> {
  const response = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Upstash request failed: ${response.status}`);
  }
  return response.json();
}

async function upstashLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  // INCR then set the TTL only on first write, so the window is fixed from the
  // first request rather than sliding forward on every hit.
  const [incr, ttl] = await upstashPipeline([
    ["INCR", key],
    ["TTL", key],
  ]);

  const count = Number(incr?.result ?? 0);
  let secondsLeft = Number(ttl?.result ?? -1);

  if (secondsLeft < 0) {
    await upstashPipeline([["EXPIRE", key, String(rule.windowSeconds)]]);
    secondsLeft = rule.windowSeconds;
  }

  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    retryAfter: Math.max(1, secondsLeft),
  };
}

// --- public API --------------------------------------------------------------

export async function rateLimit(
  key: string,
  rule: RateLimitRule
): Promise<RateLimitResult> {
  const namespaced = `spindl:rl:${key}`;

  if (rateLimitBackend() === "upstash") {
    try {
      return await upstashLimit(namespaced, rule);
    } catch (error) {
      // Never let a rate-limiter outage take down the endpoint it protects;
      // degrade to the local counter instead.
      console.error("[rate-limit] Upstash unavailable, using memory", error);
      return memoryLimit(namespaced, rule);
    }
  }

  return memoryLimit(namespaced, rule);
}

/**
 * Applies several rules at once and fails on the first breach.
 *
 * Used to enforce per-account *and* per-IP limits together: an account limit
 * alone is bypassed by registering more accounts, and an IP limit alone punishes
 * everyone behind a shared NAT.
 */
export async function rateLimitAll(
  checks: Array<{ key: string; rule: RateLimitRule }>
): Promise<RateLimitResult> {
  let strictest: RateLimitResult | null = null;

  for (const check of checks) {
    const result = await rateLimit(check.key, check.rule);
    if (!result.ok) return result;
    if (!strictest || result.remaining < strictest.remaining) {
      strictest = result;
    }
  }

  return (
    strictest ?? { ok: true, remaining: 0, limit: 0, retryAfter: 0 }
  );
}

/** Tuned per endpoint: cost to us, and how often a legitimate user needs it. */
export const RATE_LIMITS = {
  // Hits a third-party API and writes many rows. Expensive; rarely needed twice
  // in a row by a real user.
  syncPerAccount: { limit: 10, windowSeconds: 60 * 60 },
  syncPerIp: { limit: 30, windowSeconds: 60 * 60 },

  // Starting an OAuth flow is cheap but shouldn't be a redirect farm.
  connectPerAccount: { limit: 20, windowSeconds: 60 * 60 },
  connectPerIp: { limit: 40, windowSeconds: 60 * 60 },

  // Toggling visibility / dragging rows is legitimately bursty in the UI.
  curationPerAccount: { limit: 120, windowSeconds: 60 },
  curationPerIp: { limit: 300, windowSeconds: 60 },

  // The account-farming control: claiming usernames is how you'd squat the
  // namespace or bypass per-account limits by making more accounts.
  claimUsernamePerIp: { limit: 5, windowSeconds: 60 * 60 },

  // Availability checks are cheap and debounced, but generous enough that a
  // user trying names in the form never trips it -- while still making a bulk
  // walk of the namespace impractical.
  usernameCheckPerIp: { limit: 60, windowSeconds: 60 },

  // An upload costs storage, so it is tighter than the rest of the profile form.
  avatarPerAccount: { limit: 12, windowSeconds: 60 * 60 },
  avatarPerIp: { limit: 24, windowSeconds: 60 * 60 },

  profilePerAccount: { limit: 30, windowSeconds: 60 * 60 },
  profilePerIp: { limit: 60, windowSeconds: 60 * 60 },

  // The visit beacon fires once per browser session, so a real person costs one
  // hit. Generous because a school or office behind one NAT is many real people
  // sharing an address -- this is here to stop a script inflating the counter,
  // not to police traffic.
  visitPerIp: { limit: 240, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;
