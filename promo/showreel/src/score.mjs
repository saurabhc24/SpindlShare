/* The film and its soundtrack share one clock: 120 BPM, so a beat is half a
   second and a bar two. Both the picture and the music read their cues from here. */

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;
export const BARS = 32;
export const DURATION = BARS * BAR;
export const FPS = 60;

/** Seconds at a bar and beat, both counted from 1; beats may be fractional. */
export const at = (bar, beat = 1) => (bar - 1) * BAR + (beat - 1) * BEAT;

/** Where each scene sits, in seconds. */
export const SCENES = {
  needle: [at(1), at(3)],
  title: [at(3), at(5)],
  changer: [at(5), at(9)],
  links: [at(9), at(13)],
  steps: [at(13), at(15)],
  shelf: [at(15), at(21)],
  player: [at(21), at(25)],
  sand: [at(25), at(29)],
  end: [at(29), at(33)],
};

/** The needle meets the record on the cut into the first macro shot. */
export const NEEDLE_DROP = at(1, 3);
/** The two drops, where the full beat lands. */
export const DROPS = [at(5), at(25)];
/** Records land on the platter on beat 3 of bars 6, 7 and 8. */
export const LANDINGS = [at(6, 3), at(7, 3), at(8, 3)];
/** The music winds down like a platter losing power. */
export const TAPE_STOP = at(31, 3);
export const TAPE_STOP_LEN = 1.1;
export const NEEDLE_LIFT = at(32);

/** The scratch at the end of the breakdown: bar 14, beats 3 and 4. */
export const SCRATCH = [at(14, 3), at(15)];

/**
 * Where the scratched record is, in seconds of its sample, at time t: baby
 * scratches on sixteenths, then two long drags. Shared, so the records on
 * screen turn exactly as the sound moves.
 */
export function scratchPosition(t) {
  const [s, e] = SCRATCH;
  if (t <= s) return 0;
  const u = Math.min(t, e) - s;
  const sixteenth = BEAT / 4;
  if (u < BEAT * 1.5) {
    // Forward and back each sixteenth, like a hand rocking the record.
    const k = Math.floor(u / sixteenth);
    const f = (u - k * sixteenth) / sixteenth;
    const stroke = 0.5 - 0.5 * Math.cos(Math.PI * f);
    return 0.12 + (k % 2 === 0 ? stroke : 1 - stroke) * 0.16;
  }
  // Two drags: one long pull back, one push that lets the record run.
  const v = u - BEAT * 1.5;
  const f = Math.min(1, v / (BEAT * 0.5));
  const drag = f < 0.45 ? 0.12 - 0.1 * Math.sin((f / 0.45) * Math.PI * 0.5) : 0.02 + ((f - 0.45) / 0.55) ** 1.6 * 0.7;
  return drag;
}

/** F minor, one chord a bar: i, VI, III, VII. MIDI notes. */
export const CHORDS = [
  { name: "Fm9", bass: 29, keys: [53, 56, 60, 63, 67], arp: [65, 68, 72, 75, 79, 75, 72, 68] },
  { name: "Dbmaj9", bass: 37, keys: [53, 56, 60, 63], arp: [65, 68, 72, 77, 80, 77, 72, 68] },
  { name: "Abmaj9", bass: 32, keys: [55, 60, 63, 70], arp: [67, 72, 75, 79, 82, 79, 75, 72] },
  { name: "Eb69", bass: 39, keys: [55, 58, 60, 65], arp: [67, 70, 72, 77, 79, 77, 72, 70] },
];
export const chordAt = (bar) => CHORDS[(bar - 1) % CHORDS.length];

/** Which parts play in which bars, 1-based and end-exclusive. */
export const PARTS = {
  intro: [1, 3],
  build1: [3, 5],
  dropA: [5, 13],
  breakdown: [13, 15],
  grooveB: [15, 23],
  build2: [23, 25],
  dropB: [25, 31],
  outro: [31, 33],
};
export const inPart = (bar, ...names) => names.some((n) => bar >= PARTS[n][0] && bar < PARTS[n][1]);
