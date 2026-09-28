"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import styles from "./landing.module.css";

type Layout = "stacked" | "arc";

/** The width the profile is designed at; the frame is narrower, so the page is scaled down. */
const PHONE_WIDTH = 393;

const LAYOUTS: { id: Layout; label: string; note: string }[] = [
  { id: "stacked", label: "Stacked", note: "A deck you flick through, one sleeve at a time." },
  { id: "arc", label: "Arc", note: "The whole shelf fanned out along a curve." },
];

/**
 * The shipped page itself, in a frame. It only takes the pointer once asked, so a wheel
 * or a swipe over the phone still scrolls this page instead of the shelf inside it.
 */
export function ShelfDemo({ username }: { username: string }) {
  const [layout, setLayout] = useState<Layout>("stacked");
  const [live, setLive] = useState(false);
  const [scale, setScale] = useState(0.86);
  const screen = useRef<HTMLDivElement>(null);
  const note = LAYOUTS.find((l) => l.id === layout)?.note;

  useEffect(() => {
    const el = screen.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / PHONE_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section className={styles.shelf} aria-labelledby="shelf-title">
      <div className={`${styles.wrap} ${styles.shelfGrid}`}>
        <div className={styles.shelfCopy} data-reveal>
          <h2 id="shelf-title" className={`${styles.display} ${styles.h2}`}>
            A shelf, not a list.
          </h2>
          <p className={styles.lede}>
            Visitors flick through your playlists the way they&apos;d dig through records. Pick
            the layout in settings and change it whenever you like.
          </p>

          <div className={styles.switch} role="radiogroup" aria-label="Layout">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={layout === l.id}
                className={styles.switchOption}
                onClick={() => setLayout(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className={styles.shelfNote}>{note}</p>
        </div>

        <div className={styles.phone} data-live={live || undefined} data-reveal>
          <div ref={screen} className={styles.phoneScreen} style={{ "--s": scale } as CSSProperties}>
            <div className={styles.phoneStatus} aria-hidden="true">
              <span>9:41</span>
              <span className={styles.phoneIcons}>
                <i />
                <i />
                <i />
              </span>
            </div>
            {LAYOUTS.map((l) => (
              <iframe
                key={l.id}
                src={`/embed/${l.id}?u=${encodeURIComponent(username)}&chrome=1`}
                title={`A live SpindlShare page in the ${l.label.toLowerCase()} layout`}
                loading="lazy"
                hidden={layout !== l.id}
                tabIndex={live ? 0 : -1}
              />
            ))}
            {!live && (
              <button type="button" className={styles.phoneCover} onClick={() => setLive(true)}>
                <span className={styles.phoneCta}>Try it here</span>
              </button>
            )}
          </div>
          {live && (
            <button type="button" className={styles.phoneDone} onClick={() => setLive(false)}>
              Done
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
