import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/dal";
import { clientIp, rateLimitedResponse } from "@/lib/http";
import { ProviderAuthError, parseProviderSlug } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimitAll } from "@/lib/rate-limit";
import { SyncError, syncProvider } from "@/lib/sync";
import { syncFailureHint } from "@/lib/sync-status";

export async function POST(
  request: Request,
  context: RouteContext<"/api/sync/[provider]">
) {
  const { user, profile } = await requireProfile();

  const { provider: slug } = await context.params;
  const provider = parseProviderSlug(slug);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  // The most expensive endpoint in the app: it calls a third-party API and
  // writes a row per playlist. Limited per-account and per-IP so neither a
  // stuck client nor a pile of throwaway accounts can hammer Spotify on our
  // credentials -- which would get *our* app rate-limited for everyone.
  const limited = await rateLimitAll([
    { key: `sync:user:${user.id}`, rule: RATE_LIMITS.syncPerAccount },
    { key: `sync:ip:${clientIp(request)}`, rule: RATE_LIMITS.syncPerIp },
  ]);
  if (!limited.ok) return rateLimitedResponse(limited);

  const connection = await prisma.connectedAccount.findUnique({
    where: { userId_provider: { userId: user.id, provider } },
  });
  if (!connection) {
    return NextResponse.json(
      { error: "That account isn't connected." },
      { status: 400 }
    );
  }

  try {
    // `provider` came from parseProviderSlug, so it is narrowed to a provider
    // that actually has a client; the column's own type is the wider enum.
    const result = await syncProvider({
      userId: user.id,
      connection: { ...connection, provider },
    });

    revalidatePath(`/${profile.username}`);
    revalidatePath("/dashboard");

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyncError) {
      // A provider-side quota breach is a 503 with Retry-After, not a 400 --
      // nothing about the request was wrong and the client should back off.
      if (error.retryAfterSeconds !== null) {
        return NextResponse.json(
          { error: error.message, retryAfter: error.retryAfterSeconds },
          {
            status: 503,
            headers: { "Retry-After": String(error.retryAfterSeconds) },
          }
        );
      }
      return NextResponse.json(
        { error: error.message, needsReconnect: error.needsReconnect },
        { status: 400 }
      );
    }
    // The provider refused the read for a reason of its own -- an account
    // requirement, an allowlist, a revoked grant. "Sync failed, please try
    // again" is wrong for all of them: nothing about retrying helps, and the
    // user is left with no idea what happened. Explain it instead.
    if (error instanceof ProviderAuthError) {
      console.error(`[sync:${slug}] provider refused`, error);
      return NextResponse.json(
        { error: syncFailureHint(error.message) },
        { status: 400 }
      );
    }

    console.error(`[sync:${slug}] failed`, error);
    return NextResponse.json(
      { error: "Sync failed. Please try again." },
      { status: 500 }
    );
  }
}
