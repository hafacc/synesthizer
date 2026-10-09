import { type RGB, rgb2hsl } from "./colors";

export type NoteConversion = "hslc";

const A = "A".charCodeAt(0);

/** step a note letter `by` positions around the A–G cycle, preserving its case */
function shiftLetter(letter: string, by: number): string {
  const upper = letter.toUpperCase();
  const offset = (upper.charCodeAt(0) - A + by + 7) % 7;
  const shifted = String.fromCharCode(A + offset);
  return letter === upper ? shifted : shifted.toLowerCase();
}

/** convert a string with sharps in it to flats */
export function sharp2flat(sharp: string): string {
  return sharp.replaceAll(/[ACDFG]#/gi, (mat) => `${shiftLetter(mat[0], 1)}b`);
}

/** convert a string with flats in it to sharps */
export function flat2sharp(flat: string): string {
  return flat.replaceAll(/[ABDEG]b/gi, (mat) => `${shiftLetter(mat[0], -1)}#`);
}

export const orderedNotes = [
  "C",
  "D",
  "Db",
  "E",
  "Eb",
  "F",
  "G",
  "Gb",
  "A",
  "Ab",
  "B",
  "Bb",
] as const;
type Note = (typeof orderedNotes)[number];

export function hslc2note(color: RGB): [Note, number] {
  const [h, , l] = rgb2hsl(color);
  const octave = Math.min(Math.floor(l * 7), 6) + 1;
  const note = orderedNotes[Math.floor(h / 30) % 12];
  return [note, octave];
}

export function color2note(color: RGB, method: NoteConversion): [Note, number] {
  if (method === "hslc") {
    return hslc2note(color);
  } else {
    throw new Error(`unknown note conversion method ${method}`);
  }
}
