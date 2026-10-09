/** module for the piano samples the app plays */

import { asset } from "$app/paths";
import { orderedNotes } from "./notes";

const octaves = [1, 2, 3, 4, 5, 6, 7] as const;

/** seconds a note takes to die away once it is released */
export const fade = 0.6;

/** where to fetch the sample of every note, by note name like "Ab4" */
export function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const note of orderedNotes) {
    for (const octave of octaves) {
      urls[`${note}${octave}`] = asset(`Piano.mf.${note}${octave}.mp3`);
    }
  }
  return urls;
}
