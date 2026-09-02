import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";

/**
 * Whether each sign-in method has the credentials it needs.
 *
 * Registering a provider without credentials doesn't fail loudly -- it renders a
 * working-looking button that sends the user to the provider and gets a bare
 * "invalid_client" error page back, with nothing pointing at the real cause. So
 * unconfigured providers are left out entirely and the login page hides them.
 */
export function isGoogleLoginConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function isEmailLoginConfigured() {
  return Boolean(process.env.AUTH_RESEND_KEY?.trim());
}

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];

  if (isGoogleLoginConfigured()) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Login only wants identity. The YouTube connect flow requests
        // youtube.readonly separately so signing in never prompts for it.
        //
        // Deliberately no `prompt: "select_account"`. Forcing the chooser on
        // every sign-in means a returning user has to re-pick their account each
        // time, and picking the wrong one silently lands them in a *different*
        // SpindlShare account -- which reads as the app having forgotten them. Left
        // unset, Google reuses the active session when there's one and still
        // shows the chooser by itself when several are signed in.
        authorization: {
          params: { scope: "openid email profile" },
        },
      })
    );
  }

  if (isEmailLoginConfigured()) {
    providers.push(
      Resend({
        // apiKey is inferred from AUTH_RESEND_KEY
        from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
      })
    );
  }

  return providers;
}

// This config handles *app login only*. Connecting Spotify/YouTube for playlist
// import is a separate, hand-rolled OAuth flow with its own token storage
// (see lib/providers/* and the ConnectedAccount model) so that login scopes stay
// minimal and a music connection can be revoked without affecting sign-in.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // The adapter's types target the legacy `@prisma/client` output, which Prisma 7's
  // `prisma-client` generator no longer produces (ours lands in app/generated/prisma).
  // The runtime shape is identical, so bridge the nominal type gap via the adapter's
  // own parameter type rather than importing a type that can't resolve.
  adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  providers: buildProviders(),
  callbacks: {
    /**
     * The gate on deleted accounts.
     *
     * A soft-deleted user keeps its Account rows, so the adapter can still match
     * an OAuth identity to it and would happily sign the person back in. Their
     * sessions are dropped at deletion, but that only ends the session they had
     * -- this is what stops them starting another.
     *
     * Deliberately *not* solved by severing the Account rows instead. That would
     * let the same OAuth identity sign up fresh, which for a moderation delete
     * is precisely the wrong outcome; it would also break restore, since Auth.js
     * refuses to auto-link an OAuth account to an existing email.
     *
     * One extra query per sign-in, which is a rare event -- unlike the session
     * callback below, which runs on every authenticated request.
     */
    async signIn({ user }) {
      // No id yet means a brand-new signup, which by definition isn't deleted.
      if (!user?.id) return true;

      const existing = await prisma.user.findUnique({
        where: { id: user.id },
        select: { deletedAt: true },
      });

      return !existing?.deletedAt;
    },
    session({ session, user }) {
      // Expose the DB user id so server components can query Profile/Playlist.
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
