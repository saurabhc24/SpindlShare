import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import {
  signIn,
  isEmailLoginConfigured,
  isGoogleLoginConfigured,
} from "@/lib/auth";

/**
 * The sign-in methods themselves, without the page around them.
 *
 * Extracted so the /login route and the landing page's slide-in card show the
 * same thing: they are two doors into one flow, and a provider added to one but
 * not the other is a bug nobody would notice until someone couldn't sign in.
 *
 * Stays a server component even though the card that holds it is a client one --
 * it is passed through as children. That keeps the sign-in actions on the server
 * where they belong, rather than shipping a provider list and three form
 * handlers to the browser.
 */

// Shared so a second OAuth button can't drift from the first.
const OAUTH_BUTTON_CLASS = "btn-ghost w-full !py-3";

/**
 * Only same-origin relative paths, so a crafted ?callbackUrl= can't bounce a
 * freshly-authenticated user to an external site. The `(?!\/)` is what rejects
 * `//evil.com`, which is protocol-relative and would otherwise pass a naive
 * "starts with a slash" check.
 */
export function safeRedirectTo(callbackUrl: string | undefined) {
  return callbackUrl && /^\/(?!\/)/.test(callbackUrl) ? callbackUrl : "/dashboard";
}

export function SignInOptions({ redirectTo }: { redirectTo: string }) {
  const googleEnabled = isGoogleLoginConfigured();
  const emailEnabled = isEmailLoginConfigured();
  const oauthEnabled = googleEnabled;

  return (
    <>
      {!oauthEnabled && !emailEnabled && (
        <p className="note note-warn">
          No sign-in method is configured yet. Set{" "}
          <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and{" "}
          <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code>, or{" "}
          <code className="font-mono text-xs">AUTH_RESEND_KEY</code> for email
          links, then redeploy.
        </p>
      )}

      {/* Each provider is a separate sign-in *and* sign-up path: Auth.js
          creates the account on first use and signs the same person in
          afterwards, so there is no separate registration flow to build. */}
      <div className={oauthEnabled ? "space-y-3" : ""}>
        {googleEnabled && (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo });
            }}
          >
            <button type="submit" className={OAUTH_BUTTON_CLASS}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14z"
                />
              </svg>
              Continue with Google
            </button>
          </form>
        )}

      </div>

      {oauthEnabled && emailEnabled && (
        <div className="my-6 flex items-center gap-4">
          <span className="h-px flex-1 bg-[var(--panel)] " />
          <span className="text-xs uppercase tracking-wide text-ink-faint">
            or
          </span>
          <span className="h-px flex-1 bg-[var(--panel)] " />
        </div>
      )}

      {emailEnabled && (
        <form
          action={async (formData: FormData) => {
            "use server";
            try {
              await signIn("resend", {
                email: formData.get("email"),
                redirectTo,
              });
            } catch (error) {
              if (error instanceof AuthError) {
                // Sent to the full page rather than back to the card: the card
                // is gone by the time this resolves, and /login is where an
                // ?error= can actually be read and shown.
                redirect(`/login?error=EmailSignInError`);
              }
              throw error;
            }
          }}
          className="space-y-3"
        >
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="field"
          />
          <button type="submit" className="btn-gold w-full !py-3">
            Email me a sign-in link
          </button>
        </form>
      )}
    </>
  );
}
