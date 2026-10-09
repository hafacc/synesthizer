import { v4 as uuid } from "uuid";
import { type HSLC, hslc2rgb, rgb2hex, rgb2hslc } from "./colors";
import { extract } from "./extraction";
import { fit, keyName, place, sharpKey } from "./fit";
import { color2note, midi2note, note2midi } from "./notes";
import { order } from "./order";
import { lightness2height, type RawNote, summarize } from "./raw";
import { refine } from "./refine";
import { type Region, regions, surroundings } from "./regions";
import { ArrayMean, MaxBy } from "./utils";
import type { Chord, Message, Result } from "./worker-interface";
import "core-js/actual/iterator";

// how hard the least colorful region is struck
const minVelocity = 0.3;

// fill notes stay at or above C3, clear of the range where close notes blur
const fillFloor = 48;

type Sound = Pick<
  Chord,
  "notes" | "soft" | "velocity" | "key" | "sharps" | "color"
>;

/** what one region asks for before the song is fitted to a key */
interface Reading {
  notes: RawNote[];
  color: string;
  // how hard the chord is struck, from 0 to 1
  velocity: number;
  // lightness of the region's colorless part when that part is most of it
  grey: number | null;
}

/** every pixel votes for a note and an octave; the commonest are kept */
function oldReadings(
  ordered: readonly Region[],
  {
    cycles,
    colorChoice,
    minStd,
    noteMethod,
    refineMethod,
    minWeight,
    maxNotes,
  }: Message,
): Reading[] {
  if (colorChoice === "new") {
    throw new Error("hue peaks have their own conversion");
  }
  const colors: string[] = [];
  const weightedNotes: [string, number][][] = [];
  for (const { colors: pixels, num } of ordered) {
    const weighted = extract(pixels, colorChoice, { num, maxNotes, minStd });

    // NOTE not currently using saturation / chroma
    const counts = new Map<string, { count: number; color: ArrayMean<HSLC> }>();
    for (const [color, count] of weighted) {
      const [note, octave] = color2note(color, noteMethod, cycles);
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
    colors.push(bestColor.max);
  }

  const refined = refine(weightedNotes, refineMethod, { minWeight, maxNotes });
  return [...refined].map((names, index) => {
    const weights = new Map<string, number>(weightedNotes[index]);
    const total = names.reduce(
      (sum, name) => sum + (weights.get(name) ?? 0),
      0,
    );
    return {
      // these notes sit exactly on a piano key, with no lean
      notes: names.map((name) => {
        const midi = note2midi(name);
        return {
          note: midi % 12,
          pitch: midi % 12,
          height: midi,
          weight: (weights.get(name) ?? 0) / total,
        };
      }),
      color: colors[index],
      velocity: 1,
      grey: null,
    };
  });
}

/**
 * each cluster of hues is one leaning note, and the colorless part of a region
 * sets how loud it is
 */
function newReadings(
  ordered: readonly Region[],
  { img, cycles, minWeight, maxNotes, surround }: Message,
): Reading[] {
  const summaries = ordered.map(({ colors, poly }) =>
    summarize(
      colors,
      { minWeight, maxNotes, cycles },
      { colors: surroundings(img, poly), share: surround },
    ),
  );
  const mostColorful = Math.max(
    ...summaries.map(({ colorfulness }) => colorfulness),
    Number.EPSILON,
  );
  return summaries.map(
    ({ notes, colorfulness, greyShare, greyLightness, color }) => ({
      notes,
      color: rgb2hex(color),
      velocity: minVelocity + ((1 - minVelocity) * colorfulness) / mostColorful,
      grey: greyShare >= 0.5 ? greyLightness : null,
    }),
  );
}

/** fit the readings to a key and add the quiet notes */
function* sounds(
  readings: readonly Reading[],
  { fill, fit: fitOptions }: Message,
): Generator<Sound> {
  const fitted = fit(
    readings.map(({ notes }) => notes),
    fitOptions,
  );
  // pitch class of the last strongest note, for regions with no color at all
  let carried: number | null = null;
  for (const [index, { notes, key, triad }] of fitted.entries()) {
    const { color, velocity, grey } = readings[index];
    const [strongest] = notes;
    if (strongest !== undefined) {
      carried = strongest.midi % 12;
    }
    const lead = strongest !== undefined ? carried : (key?.tonic ?? carried);
    const names = notes.map(({ midi }) => midi2note(midi));
    // black adds a quiet low note and white a quiet high one; mid grey adds
    // nothing
    const soft: string[] = [];
    if (lead !== null && grey !== null && Math.abs(grey - 0.5) >= 0.2) {
      const name = midi2note(place(lead, lightness2height(grey)));
      if (!names.includes(name)) {
        soft.push(name);
      }
    }
    if (fill && triad !== null && notes.length > 0) {
      // the triad the fit read the chord as, filled in under its top note
      const top = Math.max(...notes.map(({ midi }) => midi));
      const present = new Set<number>(notes.map(({ midi }) => midi % 12));
      for (const pitchClass of triad) {
        if (!present.has(pitchClass)) {
          let midi = place(pitchClass, top - 6);
          while (midi < fillFloor) midi += 12;
          const name = midi2note(midi);
          if (!soft.includes(name)) {
            soft.push(name);
          }
        }
      }
    }
    yield {
      notes: names,
      soft,
      velocity,
      key: key && keyName(key),
      sharps: key !== null && sharpKey(key),
      color,
    };
  }
}

/** beats a region lasts: half, one, two or four, by its area against the mean */
function beatsFor(carved: readonly Region[]): number[] {
  const mean = carved.reduce((sum, { num }) => sum + num, 0) / carved.length;
  return carved.map(
    ({ num }) =>
      2 ** Math.min(2, Math.max(-1, Math.round(Math.log2(num / mean) / 2))),
  );
}

/** regions and how many beats each lasts, adding up to about `beats` */
function carve(
  { img, region, noteLength }: Message,
  beats: number,
): [Region[], number[]] {
  let carved = [...regions(img, region, beats)];
  if (noteLength === "even") {
    return [carved, carved.map(() => 1)];
  } else {
    // uneven lengths change the total, so the number of regions is adjusted
    // until the piece is about as long as asked
    let lengths = beatsFor(carved);
    let count = beats;
    for (let attempt = 0; attempt < 4; ++attempt) {
      const total = lengths.reduce((sum, length) => sum + length, 0);
      if (Math.abs(total - beats) <= Math.max(0.5, beats * 0.03)) {
        break;
      }
      count = Math.max(1, Math.round((count * beats) / total));
      carved = [...regions(img, region, count)];
      lengths = beatsFor(carved);
    }
    return [carved, lengths];
  }
}

addEventListener("message", (event: MessageEvent<Message>) => {
  try {
    const message = event.data;
    const { bpm, duration, order: orderMethod } = message;

    const [carved, lengths] = carve(message, (bpm * duration) / 60);
    const beats = new Map<Region, number>(
      carved.map((region, index) => [region, lengths[index]]),
    );
    // playback order is independent of how regions were carved
    const ordered = order(carved, orderMethod);
    const readings =
      message.colorChoice === "new"
        ? newReadings(ordered, message)
        : oldReadings(ordered, message);

    const chords: Chord[] = [];
    for (const sound of sounds(readings, message)) {
      const region = ordered[chords.length];
      const { poly, center } = region;
      chords.push({
        ...sound,
        id: uuid(),
        duration: ((beats.get(region) ?? 1) * 60000) / bpm,
        poly,
        center,
      });
    }

    const msg: Result = { typ: "success", chords };
    postMessage(msg);
  } catch (ex) {
    const err = ex instanceof Error ? ex.message : "unknown error";
    const res: Result = { typ: "err", err };
    postMessage(res);
  }
});
