import { NextResponse } from "next/server";

import { absoluteUrl } from "@/lib/app-url";
import { requireUser } from "@/lib/dal";
import { clientIp, rateLimitedResponse } from "@/lib/http";
import { createOAuthState } from "@/lib/oauth-state";
import { PROVIDERS, isProviderConfigured, parseProviderSlug } from "@/lib/providers";
import { RATE_LIMITS, rateLimitAll } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  context: RouteContext<"/api/connect/[provider]">
) {
  const user = await requireUser();

  const { provider: slug } = await context.params;
  const provider = parseProviderSlug(slug);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const limited = await rateLimitAll([
    { key: `connect:user:${user.id}`, rule: RATE_LIMITS.connectPerAccount },
    { key: `connect:ip:${clientIp(request)}`, rule: RATE_LIMITS.connectPerIp },
  ]);
  if (!limited.ok) return rateLimitedResponse(limited);

  if (!isProviderConfigured(provider)) {
    return NextResponse.redirect(
      absoluteUrl(`/dashboard?error=not_configured&provider=${slug}`)
    );
  }

  const state = await createOAuthState(provider);
  // ?switch=1 comes from "use a different account" after a failed import.
  const forceApproval =
    new URL(request.url).searchParams.get("switch") === "1";
  return NextResponse.redirect(
    PROVIDERS[provider].getAuthorizationUrl(state, { forceApproval })
  );
}
