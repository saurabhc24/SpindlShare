"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./landing.module.css";
import type { ShowcaseRecord } from "./showcase";
import type { DeckRecord } from "./turntable-3d";
import { PRESSINGS } from "./vinyl";

/** Stand-ins so the changer still has a stack when there's no showcase data. */
const BLANKS: ShowcaseRecord[] = Array.from({ length: 5 }, (_, i) => ({
  id: `blank-${i}`,
  title: "Your playlist",
  service: "Spotify",
  cover: null,
  letterboxed: false,
  songs: null,
  url: "",
}));

/** Stack order for the pressings: the colour of each edge is part of the picture. */
const STACK_COLOURS = [PRESSINGS[7], PRESSINGS[0], PRESSINGS[1], PRESSINGS[2], PRESSINGS[3], PRESSINGS[4], PRESSINGS[5], PRESSINGS[6]];

export function Changer({ records: given }: { records: ShowcaseRecord[] }) {
  const records = given.length > 0 ? given : BLANKS;
  const host = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);

  const deck = useMemo<DeckRecord[]>(
    () => records.map((r, i) => ({ ...r, color: STACK_COLOURS[i % STACK_COLOURS.length] })),
    [records]
  );

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let dispose = () => {};
    import("./turntable-3d").then(({ createTurntable }) => {
      if (disposed) return;
      const controller = createTurntable(el, {
        mode: "changer",
        records: deck,
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onNowPlaying: setNow,
        onReady: () => setReady(true),
      });
      dispose = () => controller.dispose();
    });
    return () => {
      disposed = true;
      dispose();
    };
  }, [deck]);

  const playing = records[now] ?? records[0];

  return (
    <figure className={styles.changer} aria-label="A record changer playing the playlists on a real shelf, one after another">
      <div ref={host} className={styles.stage3d} data-ready={ready || undefined} aria-hidden="true" />
      <figcaption className={styles.nowSpinning}>
        <span className={styles.tag}>Now spinning</span>
        <span className={styles.nowTitle} key={playing.id}>
          {playing.title}
        </span>
        <span className={styles.nowMeta} key={`${playing.id}-meta`}>
          {playing.songs ? `${playing.songs} songs · ` : ""}
          {playing.service}
        </span>
      </figcaption>
    </figure>
  );
}
