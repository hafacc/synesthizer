/** module for extracting appropriate tempo from an image */
import { hslcMean } from "./extraction";
import { hslc2note, orderedNotes } from "./notes";
import { single } from "./regions";

export type TempoMethod = "manual" | "mean-key";

// TODO set based on more than the mean color, but number of colors, or texture?

export function meanKeyTempo(
  img: ImageData,
  low: number = 25,
  high: number = 450,
): number {
  const [{ colors }] = single(img);
  const [[color]] = hslcMean(colors);
  const [note, octave] = hslc2note(color);
  const noteNum = orderedNotes.indexOf(note); // [0, 11]
  const keyNum = noteNum + octave * 12; // [12, 95] since octave is [1, 7]
  // place it from low to high on a log-scale across the actual key range
  const frac = (keyNum - 12) / (95 - 12);
  const bpm = Math.exp((Math.log(high) - Math.log(low)) * frac + Math.log(low));
  return Math.round(Math.min(high, Math.max(low, bpm)));
}
