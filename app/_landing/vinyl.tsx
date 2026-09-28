import { useId, type CSSProperties } from "react";

import styles from "./landing.module.css";

/** Pressing colours, cycled across the stack; the section colours are taken from the first three. */
export const PRESSINGS = [
  "#c3192f", // ruby
  "#2b3fe0", // cobalt
  "#f6b526", // marigold
  "#12a37f", // jade
  "#9d80ff", // lilac
  "#e9e1d3", // bone
  "#56504a", // smoke
  "#151211", // black
];

/**
 * A record seen from straight above: grooves, the cover as its label, and an optional
 * line of text pressed into the run-out around the label.
 */
export function VinylFace({
  color,
  cover,
  letterboxed = false,
  ring,
  spinning = false,
}: {
  color: string;
  cover: string | null;
  letterboxed?: boolean;
  ring?: string;
  spinning?: boolean;
}) {
  const pathId = useId();
  // About 64 capitals fit round the label; repeat short text to fill it, cut long text to fit.
  const unit = ring && ring.length > 58 ? `${ring.slice(0, 56)}…` : ring;
  const ringText = unit ? `${unit} ✦ `.repeat(Math.max(1, Math.floor(64 / (unit.length + 3)))) : "";

  return (
    <div className={styles.face} style={{ "--vinyl": color } as CSSProperties}>
      <div className={styles.faceSpin} data-spinning={spinning || undefined}>
        <div className={styles.grooves} />
        <div className={styles.vinylLabel}>
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              className={letterboxed ? styles.labelArtCrop : styles.labelArt}
            />
          ) : (
            <span className={styles.labelBlank} />
          )}
        </div>
        {ring && (
          <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <path id={pathId} d="M50,50 m-24.5,0 a24.5,24.5 0 1,1 49,0 a24.5,24.5 0 1,1 -49,0" />
            </defs>
            <text className={styles.ringText}>
              <textPath href={`#${pathId}`} textLength="152.5" lengthAdjust="spacing">
                {ringText}
              </textPath>
            </text>
          </svg>
        )}
        <div className={styles.hole} />
      </div>
      {/* Outside the spinning layer: light stays put while the record turns under it. */}
      <div className={styles.sheen} />
    </div>
  );
}
