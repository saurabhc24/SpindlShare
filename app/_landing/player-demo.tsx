"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./landing.module.css";
import type { ShowcaseRecord, ShowcaseSong } from "./showcase";
import type { TurntableController } from "./turntable-3d";
import { PRESSINGS } from "./vinyl";

function clock(ms: number | null) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Real previews from a real playlist, played the way a visitor would hear them. */
export function PlayerDemo({ songs, source }: { songs: ShowcaseSong[]; source: ShowcaseRecord | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Nothing keeps sounding once the section has scrolled away.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) audio.current?.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const play = (index: number) => {
    const el = audio.current;
    if (!el) return;
    if (current === index && !el.paused) {
      el.pause();
      return;
    }
    if (current !== index) {
      el.src = songs[index].previewUrl;
      setCurrent(index);
    }
    el.play().catch(() => setPlaying(false));
  };

  const song = current === null ? null : songs[current];

  // The same modelled turntable as the hero, built only once this section is close.
  const deckHost = useRef<HTMLDivElement>(null);
  const deck = useRef<TurntableController | null>(null);
  const [deckReady, setDeckReady] = useState(false);
  useEffect(() => {
    const el = deckHost.current;
    if (!el) return;
    let disposed = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        import("./turntable-3d").then(({ createTurntable }) => {
          if (disposed) return;
          deck.current = createTurntable(el, {
            mode: "single",
            records: [
              {
                id: source?.id ?? "deck",
                title: source?.title ?? "SpindlShare",
                service: source?.service ?? "Spotify",
                songs: source?.songs ?? null,
                cover: source?.cover ?? null,
                letterboxed: source?.letterboxed ?? false,
                color: PRESSINGS[7],
              },
            ],
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            onReady: () => setDeckReady(true),
          });
        });
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => {
      disposed = true;
      io.disconnect();
      deck.current?.dispose();
      deck.current = null;
    };
  }, [source]);

  useEffect(() => {
    deck.current?.setPlaying(playing);
  }, [playing, deckReady]);
  useEffect(() => {
    if (song) deck.current?.setLabel(song.title, song.artist ?? "");
  }, [song, deckReady]);

  return (
    <section ref={section} className={styles.player} aria-labelledby="player-title">
      <div className={`${styles.wrap} ${styles.playerGrid}`}>
        <div ref={deckHost} className={styles.deck3d} data-ready={deckReady || undefined} aria-hidden="true" />

        <div className={styles.playerCopy}>
          <div className={styles.playerHead} data-reveal>
            <h2 id="player-title" className={`${styles.display} ${styles.h2}`}>
              Tap a song.
              <br />
              Hear it.
            </h2>
            <p className={styles.lede}>
              Songs play right on the page, with no app to open. Spotify playlists play a
              30-second preview; YouTube Music playlists play the whole song.
            </p>
          </div>

          {songs.length > 0 && (
            <>
              <ol className={styles.songs} aria-label={source ? `Songs from ${source.title}` : "Songs"}>
                {songs.map((s, i) => {
                  const isCurrent = current === i;
                  return (
                    <li key={s.previewUrl}>
                      <button
                        type="button"
                        className={styles.song}
                        aria-pressed={isCurrent && playing}
                        aria-label={`${isCurrent && playing ? "Pause" : "Play"} ${s.title}`}
                        onClick={() => play(i)}
                        data-current={isCurrent || undefined}
                      >
                        <span className={styles.songIcon} aria-hidden="true">
                          {isCurrent && playing ? (
                            <span className={styles.eq}>
                              <i />
                              <i />
                              <i />
                            </span>
                          ) : (
                            <svg viewBox="0 0 12 14" width="11" height="13">
                              <path d="M1 1.2v11.6a1 1 0 0 0 1.5.9l9-5.8a1 1 0 0 0 0-1.7l-9-5.8A1 1 0 0 0 1 1.2Z" fill="currentColor" />
                            </svg>
                          )}
                        </span>
                        <span className={styles.songMeta}>
                          <b>{s.title}</b>
                          <span>{s.artist}</span>
                        </span>
                        <span className={styles.songTime}>{clock(s.durationMs)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {source && (
                <p className={styles.playerFoot}>
                  From <b>{source.title}</b>, one of the playlists on this shelf.
                </p>
              )}
            </>
          )}
          <audio
            ref={audio}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              if (current !== null && current + 1 < songs.length) play(current + 1);
              else setPlaying(false);
            }}
          />
        </div>
      </div>
    </section>
  );
}
