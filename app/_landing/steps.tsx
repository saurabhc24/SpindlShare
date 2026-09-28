"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useClaimSlug } from "./claim-store";
import styles from "./landing.module.css";
import type { ShowcaseRecord } from "./showcase";
import { PRESSINGS, VinylFace } from "./vinyl";

/** A real sequence, so the numbers are earned: nothing works until the step before it. */
export function Steps({ records }: { records: ShowcaseRecord[] }) {
  const slug = useClaimSlug();
  const pasted = records.find((r) => r.service === "Spotify") ?? records[0] ?? null;
  const shared = records.find((r) => r !== pasted && r.cover) ?? pasted;

  // The sleeves hold the same modelled records as the turntables, rendered once into images.
  const list = useRef<HTMLOListElement>(null);
  const [baked, setBaked] = useState<string[] | null>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const spec = (r: ShowcaseRecord | null, color: string, title: string, meta: string) => ({
          id: r?.id ?? title,
          title,
          service: meta,
          songs: null,
          cover: r?.cover ?? null,
          letterboxed: r?.letterboxed ?? false,
          color,
        });
        import("./turntable-3d")
          .then(({ bakeRecords }) =>
            bakeRecords([
              { ...spec(null, PRESSINGS[5], "spindlshare.com/yourname", ""), labelColor: "#c3192f" },
              spec(pasted, PRESSINGS[2], pasted?.title ?? "Your playlist", pasted?.service ?? ""),
              spec(shared, PRESSINGS[3], shared?.title ?? "Your playlist", shared?.service ?? ""),
            ])
          )
          .then((images) => {
            if (!cancelled) setBaked(images);
          })
          .catch(() => {});
      },
      { rootMargin: "500px" }
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [pasted, shared]);

  const disc = (i: number, fallback: ReactNode) =>
    baked?.[i] ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={baked[i]} alt="" className={styles.bakedRecord} />
    ) : (
      fallback
    );

  return (
    <section className={styles.steps} aria-labelledby="steps-title">
      <div className={styles.wrap}>
        <div className={styles.sectionHead} data-reveal>
          <h2 id="steps-title" className={`${styles.display} ${styles.h2}`}>
            Set up in three steps.
          </h2>
          <p className={styles.lede}>About a minute from start to finish, and nothing to install.</p>
        </div>

        <ol ref={list} className={styles.stepList}>
          <li className={styles.step} style={{ "--sleeve": "var(--ruby)" } as CSSProperties} data-reveal>
            <div className={styles.sleeveRecord}>
              {disc(0, <VinylFace color={PRESSINGS[5]} cover={null} ring={`spindlshare.com/${slug}`} />)}
            </div>
            <div className={styles.sleeve}>
              <span className={`${styles.wordmark} ${styles.stepNum}`}>1</span>
              <p className={styles.nameTicket}>
                <span>spindlshare.com/</span>
                <strong>{slug}</strong>
              </p>
              <h3 className={`${styles.display} ${styles.h3}`}>Claim your name</h3>
              <p className={styles.stepText}>It becomes your link. You can change it later in settings.</p>
            </div>
          </li>

          <li className={styles.step} style={{ "--sleeve": "var(--cobalt)" } as CSSProperties} data-reveal>
            <div className={styles.sleeveRecord}>
              {disc(1, <VinylFace color={PRESSINGS[2]} cover={pasted?.cover ?? null} letterboxed={pasted?.letterboxed} />)}
            </div>
            <div className={styles.sleeve}>
              <span className={`${styles.wordmark} ${styles.stepNum}`}>2</span>
              <PasteDemo record={pasted} />
              <h3 className={`${styles.display} ${styles.h3}`}>Paste your playlist links</h3>
              <p className={styles.stepText}>
                Spotify, YouTube or YouTube Music. The cover, the name and the songs come with it.
              </p>
            </div>
          </li>

          <li className={styles.step} style={{ "--sleeve": "var(--marigold)" } as CSSProperties} data-light data-reveal>
            <div className={styles.sleeveRecord}>
              {disc(2, <VinylFace color={PRESSINGS[3]} cover={shared?.cover ?? null} letterboxed={shared?.letterboxed} />)}
            </div>
            <div className={styles.sleeve}>
              <span className={`${styles.wordmark} ${styles.stepNum}`}>3</span>
              <div className={styles.bio} aria-hidden="true">
                <span className={styles.bioAvatar}>{slug.charAt(0).toUpperCase()}</span>
                <span className={styles.bioText}>
                  <b>{slug}</b>
                  <span>playlists for every mood</span>
                  <span className={styles.bioLink}>spindlshare.com/{slug}</span>
                </span>
              </div>
              <h3 className={`${styles.display} ${styles.h3}`}>Share one link</h3>
              <p className={styles.stepText}>
                Put it in your bio. Anyone can browse your shelf and play songs without signing in.
              </p>
            </div>
          </li>
        </ol>
      </div>
    </section>
  );
}

/** Types a real playlist link, then shows what came back from it. Plays once, on first view. */
function PasteDemo({ record }: { record: ShowcaseRecord | null }) {
  const url = (record?.url ?? "https://open.spotify.com/playlist/4X9STQs4rZQjXHLlhjVaNY").replace(/^https:\/\//, "");
  const box = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setTyped(url.length);
          return;
        }
        let i = 0;
        timer = window.setInterval(() => {
          i = Math.min(url.length, i + 2);
          setTyped(i);
          if (i >= url.length) window.clearInterval(timer);
        }, 45);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [url]);

  const done = typed >= url.length;

  return (
    <div ref={box} className={styles.paste} aria-hidden="true">
      <div className={styles.pasteField}>
        <span className={styles.pasteText}>{url.slice(0, typed) || "Paste a playlist link"}</span>
        {!done && <span className={styles.caret} />}
      </div>
      <div className={styles.pasteResult} data-done={done || undefined}>
        <span className={styles.pasteCover}>
          {record?.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={record.cover} alt="" data-crop={record.letterboxed || undefined} />
          )}
        </span>
        <span className={styles.pasteMeta}>
          <b>{record?.title ?? "Your playlist"}</b>
          <span>
            {record?.songs ? `${record.songs} songs · ` : ""}
            {record?.service ?? "Spotify"}
          </span>
        </span>
        <span className={styles.pasteCheck}>Added</span>
      </div>
    </div>
  );
}
