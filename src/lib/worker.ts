import { v4 as uuid } from "uuid";
import { type HSLC, hslc2rgb, rgb2hex, rgb2hslc } from "./colors";
import { extract } from "./extraction";
import { color2note } from "./notes";
import { order } from "./order";
import { refine } from "./refine";
import { regions } from "./regions";
import { ArrayMean, MaxBy } from "./utils";
import type { Chord, Message, Result } from "./worker-interface";
import "core-js/actual/iterator";

addEventListener("message", (event: MessageEvent<Message>) => {
  try {
    const {
      img,
      bpm,
      duration,
      colorChoice,
      minStd,
      noteMethod,
      region,
      order: orderMethod,
      refineMethod,
      minWeight,
      maxNotes,
    } = event.data;

    const approxBeats = (bpm * duration) / 60;

    const chords: Chord[] = [];
    const weightedNotes: [string, number][][] = [];
    // playback order is independent of how regions were carved
    const ordered = order([...regions(img, region, approxBeats)], orderMethod);
    for (const { colors, num, poly, center } of ordered) {
      const weighted = extract(colors, colorChoice, {
        num,
        maxNotes,
        minStd,
      });

      // NOTE not currently using saturation / chroma
      const counts = new Map<
        string,
        { count: number; color: ArrayMean<HSLC> }
      >();
      for (const [color, count] of weighted) {
        const [note, octave] = color2note(color, noteMethod);
        const rep = `${note}${octave}`;
        let entry = counts.get(rep);
        if (entry === undefined) {
          entry = { count: 0, color: new ArrayMean<HSLC>() };
          counts.set(rep, entry);
        }
        entry.count += count;
        entry.color.push(rgb2hslc(color), count);
      }
      const vals = Iterator.from(counts.values());
      const norm = vals.reduce((t, { count }) => t + count, 0);
      const bestColor = new MaxBy<string>();
      const notes: [string, number][] = [];
      for (const [note, { count, color }] of counts) {
        bestColor.push(rgb2hex(hslc2rgb(color.mean)), count);
        notes.push([note, count / norm]);
      }
      weightedNotes.push(notes);

      chords.push({
        id: uuid(),
        notes: [], // update after refining
        duration: 60000 / bpm,
        color: bestColor.max,
        poly,
        center,
      });
    }

    // refine the notes and update chords
    refine(weightedNotes, refineMethod, { minWeight, maxNotes }).forEach(
      (notes, i) => {
        chords[i].notes = notes;
      },
    );

    const msg: Result = { typ: "success", chords };
    postMessage(msg);
  } catch (ex) {
    const err = ex instanceof Error ? ex.message : "unknown error";
    const res: Result = { typ: "err", err };
    postMessage(res);
  }
});
