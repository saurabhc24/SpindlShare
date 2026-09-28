"use client";

import { useClaimSlug } from "./claim-store";
import styles from "./landing.module.css";

const FALLBACK = [
  "https://open.spotify.com/playlist/4X9STQs4rZQjXHLlhjVaNY",
  "https://music.youtube.com/playlist?list=PLbX5hFBka5vs",
  "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  "https://www.youtube.com/playlist?list=PLRFsqLDIFZ-FleGAI8OZr6QPtjTnqvydQ",
];

/** The links people juggle today, running behind the one they'd share instead. */
export function LinkStrip({ urls }: { urls: string[] }) {
  const slug = useClaimSlug();
  const pool = urls.length >= 4 ? urls : FALLBACK;
  const rows = [0, 1, 2, 3, 4, 5, 6].map((r) => pool.map((_, i) => pool[(i + r * 3) % pool.length]));

  return (
    <section className={styles.strip} aria-labelledby="strip-title">
      <div className={styles.stripRows} aria-hidden="true">
        {rows.map((row, r) => (
          <div key={r} className={styles.stripRow} data-reverse={r % 2 === 1 || undefined}>
            <div className={styles.stripTrack}>
              {[...row, ...row].map((url, i) => (
                <span key={i} className={styles.stripUrl}>
                  {url.replace(/^https:\/\//, "")}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.stripCenter} data-reveal>
        <h2 id="strip-title" className={styles.stripKicker}>
          All of those links, behind one.
        </h2>
        <p className={styles.stripLink}>
          <span>spindlshare.com/</span>
          <strong>{slug}</strong>
        </p>
      </div>
    </section>
  );
}
