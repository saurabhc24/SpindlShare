import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";

import { showcaseFonts } from "@/app/fonts";
import { appBaseUrl } from "@/lib/app-url";

import { VisitBeacon } from "./visit-beacon";
import "./globals.css";

const base = appBaseUrl();

export const metadata: Metadata = {
  // Two domains serve the same pages, so canonical and share URLs resolve against the primary one.
  ...(URL.canParse(base) ? { metadataBase: new URL(base) } : {}),
  title: {
    default: "SpindlShare",
    template: "%s | SpindlShare",
  },
  description:
    "Everything you've got spinning, on one shelf. Share your Spotify and YouTube playlists from a single link.",
  // Without these a shared link shows as bare text; the image is app/opengraph-image.jpg.
  openGraph: {
    type: "website",
    siteName: "SpindlShare",
    title: "SpindlShare",
    description: "Everything you've got spinning, on one shelf. Share your Spotify and YouTube playlists from a single link.",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * `interactive-widget=resizes-content` is the whole reason this export exists.
 *
 * By default the on-screen keyboard covers the page without the page knowing:
 * the layout viewport keeps its full height, so a form centred in it stays
 * centred behind the keyboard and its submit button can end up unreachable.
 * This makes the keyboard take the height instead, so dvh units and
 * height-based media queries see the space that is actually left.
 *
 * The other two values are Next's defaults, restated because declaring a
 * viewport export replaces them wholesale rather than merging.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The showcase pair is applied here rather than per route now that every
    // screen uses it. Geist is gone -- nothing referenced it once the dashboard
    // moved into the same scene as the public page.
    <html lang="en" className={`${showcaseFonts} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        {/* Vercel's own count stays -- it is the one with bot filtering and a
            dashboard. This is the same number in our database, so the admin page
            doesn't depend on a third party being up or on a plan tier. */}
        <VisitBeacon />
        <Analytics />
      </body>
    </html>
  );
}
