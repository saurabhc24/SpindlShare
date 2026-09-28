import Link from "next/link";

import { ClaimForm } from "./claim-form";
import { Cymatics } from "./cymatics";
import styles from "./landing.module.css";

/** Set like the credits on the back of a sleeve: every line is a fact about the product. */
const CREDITS: [string, string][] = [
  ["Works with", "Spotify, YouTube and YouTube Music. Anything else goes in as a plain link."],
  ["Setup", "Paste public playlist links. There’s no account to connect."],
  ["Each playlist", "Its cover, its name and up to 100 songs, with the full count shown."],
  ["Playback", "30-second previews from Spotify, whole songs from YouTube Music."],
  ["Layouts", "A stacked deck or a sweeping arc."],
  ["For visitors", "Nothing to install and nothing to sign in to."],
  ["Price", "Free."],
];

export function BackCover() {
  return (
    <section className={styles.back} aria-labelledby="back-title">
      <div className={`${styles.wrap} ${styles.backGrid}`}>
        <div className={styles.finale} data-reveal>
          <h2 id="back-title" className={`${styles.display} ${styles.h2}`}>
            Your shelf is one link away.
          </h2>
          <div className={styles.finaleClaim}>
            <ClaimForm id="claim-footer" />
          </div>
        </div>

        <div className={styles.credits} data-reveal>
          <p className={styles.tag}>Liner notes</p>
          <dl>
            {CREDITS.map(([term, detail]) => (
              <div key={term} className={styles.credit}>
                <dt>{term}</dt>
                <dd>{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className={styles.backBase}>
        <Cymatics />
      <footer className={styles.wrap}>
        <div className={styles.footer}>
          <span>&copy; {new Date().getFullYear()} SpindlShare</span>
          <nav aria-label="Legal" className={styles.footerLinks}>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>

      <p className={`${styles.wordmark} ${styles.giantMark}`} aria-hidden="true">
        SpindlShare
      </p>
      </div>
    </section>
  );
}
