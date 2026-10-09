/** module for extracting appropriate tempo from an image */
import { hslcMean } from "./extraction";
import { hslc2note, orderedNotes } from "./notes";
import { single } from "./regions";

export type TempoMethod = "manual" | "mean-key" | "edges" | "colorfulness";

// slowest and fastest tempo any method picks
const low = 25;
const high = 450;
// about how many samples across a picture the measures below take, so that
// they do not depend on its size
const across = 256;

/** tempo a fraction of the way from slowest to fastest, on a log scale */
function scaled(frac: number): number {
  const clamped = Math.min(1, Math.max(0, frac));
  return Math.round(Math.exp(Math.log(low) + Math.log(high / low) * clamped));
}

/** where a value sits between two anchors on a log scale */
function between(value: number, slow: number, fast: number): number {
  return Math.log(Math.max(value, slow) / slow) / Math.log(fast / slow);
}

/** tempo from the note the picture's mean color maps to: lighter is faster */
export function meanKeyTempo(img: ImageData): number {
  const [{ colors }] = single(img);
  const [[color]] = hslcMean(colors);
  const [note, octave] = hslc2note(color);
  const noteNum = orderedNotes.indexOf(note); // [0, 11]
  const keyNum = noteNum + octave * 12; // [12, 95] since octave is [1, 7]
  // place it from low to high on a log-scale across the actual key range
  return scaled((keyNum - 12) / (95 - 12));
}

/** mean of a measure over a grid of pixels and their right and lower neighbors */
function sampled(
  img: ImageData,
  measure: (here: number, right: number, below: number) => number,
): number {
  const step = Math.max(
    1,
    Math.round(Math.max(img.width, img.height) / across),
  );
  let total = 0;
  let count = 0;
  for (let row = 0; row + step < img.height; row += step) {
    for (let column = 0; column + step < img.width; column += step) {
      const here = (row * img.width + column) * 4;
      total += measure(here, here + step * 4, here + step * img.width * 4);
      count += 1;
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * tempo from how much the picture's lightness changes from one sample to the
 * next: a busy picture is fast and a smooth one slow
 */
export function edgeTempo(img: ImageData): number {
  const { data } = img;
  const lightness = (at: number): number =>
    (Math.max(data[at], data[at + 1], data[at + 2]) +
      Math.min(data[at], data[at + 1], data[at + 2])) /
    510;
  const change = sampled(
    img,
    (here, right, below) =>
      (Math.abs(lightness(right) - lightness(here)) +
        Math.abs(lightness(below) - lightness(here))) /
      2,
  );
  // anchors span what test paintings and photos measured: 0.015 to 0.07
  return scaled(between(change, 0.012, 0.08));
}

/** tempo from how colorful the picture is: vivid is fast and grey slow */
export function colorfulTempo(img: ImageData): number {
  const { data } = img;
  const colorfulness = sampled(
    img,
    (here) =>
      (Math.max(data[here], data[here + 1], data[here + 2]) -
        Math.min(data[here], data[here + 1], data[here + 2])) /
      255,
  );
  // anchors span what test paintings and photos measured: 0.075 to 0.26
  return scaled(between(colorfulness, 0.05, 0.3));
}

/** the tempo a method reads off a picture */
export function tempoOf(
  img: ImageData,
  method: Exclude<TempoMethod, "manual">,
): number {
  if (method === "mean-key") {
    return meanKeyTempo(img);
  } else if (method === "edges") {
    return edgeTempo(img);
  } else if (method === "colorfulness") {
    return colorfulTempo(img);
  } else {
    throw new Error(`unknown tempo method ${method}`);
  }
}
