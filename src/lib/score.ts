/** module for writing a song out: as timed notes to render, and as sheet music */

import { note2midi } from "./notes";
import type { Chord } from "./worker-interface";

/** one note being struck and held */
export interface Strike {
  /** note name like "Ab4" */
  note: string;
  /** seconds from the start of the song */
  start: number;
  /** seconds the note is held before it starts to fade */
  length: number;
  /** how hard it is struck, from 0 to 1 */
  velocity: number;
}

// how hard a chord's quiet notes are struck
export const softVelocity = 0.25;

/**
 * every note of a song as it is struck; with `hold`, a note shared by
 * consecutive chords is struck once and held through them
 */
export function strikes(song: readonly Chord[], hold: boolean): Strike[] {
  const struck: Strike[] = [];
  // notes still held from the previous chord, by name
  let held = new Map<string, Strike>();
  let start = 0;
  for (const chord of song) {
    const length = chord.duration / 1000;
    const sounding = new Map<string, Strike>();
    const add = (note: string, velocity: number): void => {
      const carried = hold ? held.get(note) : undefined;
      if (carried === undefined) {
        const strike = { note, start, length, velocity };
        struck.push(strike);
        sounding.set(note, strike);
      } else {
        carried.length += length;
        sounding.set(note, carried);
      }
    };
    for (const note of chord.notes) add(note, chord.velocity);
    for (const note of chord.soft) add(note, softVelocity);
    held = sounding;
    start += length;
  }
  return struck;
}

const letters = ["C", "D", "E", "F", "G", "A", "B"];
// each pitch class as a letter and an accidental, spelled with sharps or flats
const sharpNames: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [2, 0],
  [3, 0],
  [3, 1],
  [4, 0],
  [4, 1],
  [5, 0],
  [5, 1],
  [6, 0],
];
const flatNames: [number, number][] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, -1],
  [2, 0],
  [3, 0],
  [4, -1],
  [4, 0],
  [5, -1],
  [5, 0],
  [6, -1],
  [6, 0],
];
// letters in the order key signatures add sharps; flats go the other way
const sharpOrder = [3, 0, 4, 1, 5, 2, 6];
const signs = new Map<number, string>([
  [-1, "_"],
  [0, "="],
  [1, "^"],
]);
// note lengths that can be written as one note, in eighths, longest first
const writable = [8, 6, 4, 3, 2, 1];
const barLength = 8;

interface Signature {
  // abc name of the key, like "F#m"
  name: string;
  sharps: boolean;
  // accidental the key gives each letter
  byLetter: number[];
  // six flats spell B as C flat
  flatC: boolean;
}

function signatureOf(key: string | null): Signature {
  if (key === null) {
    return {
      name: "C",
      sharps: false,
      byLetter: letters.map(() => 0),
      flatC: false,
    };
  } else {
    const [tonicName, mode] = key.split(" ");
    const minor = mode === "minor";
    const tonic = note2midi(`${tonicName}0`) % 12;
    // steps clockwise around the circle of fifths from C major
    const steps = (((minor ? tonic + 3 : tonic) % 12) * 7) % 12;
    const sharps = steps >= 1 && steps <= 5;
    const byLetter = letters.map(() => 0);
    if (sharps) {
      for (const letter of sharpOrder.slice(0, steps)) byLetter[letter] = 1;
    } else if (steps > 0) {
      for (const letter of sharpOrder.toReversed().slice(0, 12 - steps)) {
        byLetter[letter] = -1;
      }
    }
    const [letter, accidental] = (sharps ? sharpNames : flatNames)[tonic];
    const name = `${letters[letter]}${accidental > 0 ? "#" : accidental < 0 ? "b" : ""}${minor ? "m" : ""}`;
    return { name, sharps, byLetter, flatC: steps === 6 };
  }
}

/** split a length in eighths into lengths that can each be written as a note */
function writtenLengths(length: number): number[] {
  const parts: number[] = [];
  let left = length;
  while (left > 0) {
    const part = writable.find((candidate) => candidate <= left) ?? 1;
    parts.push(part);
    left -= part;
  }
  return parts;
}

/**
 * Write a song as abc notation, for two piano staves.
 *
 * Notes from middle C up go on the treble staff and the rest on the bass. The
 * key signature follows each chord's fitted key, changing mid-piece if the key
 * does, and notes are spelled with that key's sharps or flats. Lengths are in
 * eighth notes with a beat as a quarter, bars hold four beats, and a chord
 * that crosses a bar line is tied over it.
 *
 * ```ts
 * const abc = toAbc(song, 96);
 * ```
 */
export function toAbc(song: readonly Chord[], bpm: number): string {
  const beat = 60000 / bpm;
  const voices = [
    { name: "1", clef: "treble", holds: (midi: number) => midi >= 60 },
    { name: "2", clef: "bass", holds: (midi: number) => midi < 60 },
  ];
  const first = signatureOf(song[0]?.key ?? null);
  const lines = [
    "X:1",
    "M:4/4",
    "L:1/8",
    `Q:1/4=${Math.round(bpm)}`,
    "%%score {1 | 2}",
    ...voices.map(({ name, clef }) => `V:${name} clef=${clef}`),
    `K:${first.name}`,
  ];
  for (const { name, holds } of voices) {
    let signature = first;
    let key = song[0]?.key ?? null;
    // accidentals written so far in this bar, by letter and octave
    let written = new Map<string, number>();
    let filled = 0;
    let text = "";
    for (const chord of song) {
      if (chord.key !== key) {
        key = chord.key;
        signature = signatureOf(key);
        written = new Map<string, number>();
        text += `[K:${signature.name}]`;
      }
      const midis = [...chord.notes, ...chord.soft]
        .map(note2midi)
        .filter(holds)
        .sort((low, high) => low - high);
      const spelled = (): string =>
        midis
          .map((midi) => {
            let [letter, accidental] = (
              signature.sharps ? sharpNames : flatNames
            )[midi % 12];
            let octave = Math.floor(midi / 12) - 1;
            if (signature.flatC && midi % 12 === 11) {
              letter = 0;
              accidental = -1;
              octave += 1;
            }
            const place = `${letter}:${octave}`;
            const current = written.get(place) ?? signature.byLetter[letter];
            written.set(place, accidental);
            const sign = current === accidental ? "" : signs.get(accidental);
            // abc writes octave 4 in capitals and octave 5 in lower case
            const pitch =
              octave >= 5
                ? letters[letter].toLowerCase() + "'".repeat(octave - 5)
                : letters[letter] + ",".repeat(4 - octave);
            return `${sign}${pitch}`;
          })
          .join("");
      let left = Math.max(1, Math.round((chord.duration / beat) * 2));
      while (left > 0) {
        const room = barLength - filled;
        const inBar = Math.min(left, room);
        const parts = writtenLengths(inBar);
        parts.forEach((part, index) => {
          const last = index === parts.length - 1 && inBar === left;
          const body = midis.length === 0 ? "z" : `[${spelled()}]`;
          const tie = midis.length > 0 && !last ? "-" : "";
          text += `${body}${part === 1 ? "" : part}${tie} `;
        });
        left -= inBar;
        filled += inBar;
        if (filled === barLength) {
          text += "| ";
          filled = 0;
          written = new Map<string, number>();
        }
      }
    }
    lines.push(`[V:${name}] ${text.trimEnd().replace(/\|$/, "").trimEnd()} |]`);
  }
  return lines.join("\n");
}
