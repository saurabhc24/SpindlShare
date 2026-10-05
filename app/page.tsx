import type { Metadata } from "next";
import Link from "next/link";

import { ProviderIcon } from "@/components/provider-badge";

import { Changer } from "./_landing/changer";
import styles from "./_landing/landing.module.css";
import { BackCover } from "./_landing/back-cover";
import { LinkStrip } from "./_landing/link-strip";
import { Nav } from "./_landing/nav";
import { PlayerDemo } from "./_landing/player-demo";
import { ShelfDemo } from "./_landing/shelf-demo";
import { getShowcase, SHOWCASE_USERNAME } from "./_landing/showcase";
import { Steps } from "./_landing/steps";

const SHARE_TITLE = "SpindlShare: one link for every playlist you've made";
const SHARE_DESCRIPTION =
  "Paste your Spotify and YouTube Music playlists, pick the ones to show, and share a shelf people can actually play.";

// Spelled out in full: a page's openGraph replaces the layout's rather than merging with it.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "SpindlShare", url: "/", title: SHARE_TITLE, description: SHARE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_DESCRIPTION },
};

// Built from a real shelf, so it refreshes hourly instead of querying on every visit.
export const revalidate = 3600;

export default async function Home() {
  const showcase = await getShowcase();

  return (
    <div className={styles.page}>
      <Nav />

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <p className={styles.worksWith}>
                <span>
                  <ProviderIcon provider="SPOTIFY" className="h-[18px] w-[18px]" style={{ color: "#1ed760" }} />
                  Spotify
                </span>
                <span>
                  <ProviderIcon provider="YOUTUBE" className="h-[18px] w-[18px]" style={{ color: "#ff3d3d" }} />
                  YouTube Music
                </span>
              </p>
              <h1 id="hero-title" className={`${styles.display} ${styles.heroTitle}`}>
                Everything you&apos;ve got <em>spinning.</em>
              </h1>
              <p className={`${styles.lede} ${styles.heroLede}`}>
                One link for the playlists you&apos;ve made on Spotify and YouTube Music. Paste them
                in, pick the ones to show, and share a shelf people can actually play.
              </p>
              <div className={styles.heroClaim}>
                <Link href="/signup" className={styles.pill}>
                  Claim your link
                </Link>
              </div>
            </div>
            <Changer records={showcase.records} />
          </div>
        </section>

        <LinkStrip urls={showcase.records.map((r) => r.url)} />
        <Steps records={showcase.records} />
        <ShelfDemo username={SHOWCASE_USERNAME} />
        <PlayerDemo songs={showcase.songs} source={showcase.songSource} />
        <BackCover />
      </main>

    </div>
  );
}
