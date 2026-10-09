/** module for reading a chord off the colors of a region, before key fitting */

import { type RGB, rgb2hsl } from "./colors";

/** a note read off one cluster of similar hues */
export interface RawNote {
  /** pitch class the cluster's mean hue falls on */
  note: number;
  /**
   * where the mean hue sits between `note` and the next note up or down that
   * it leans toward, as a fractional pitch class in [0, 12)
   */
  pitch: number;
  /** keyboard height the cluster's lightness asks for, as a midi number */
  height: number;
  /** share of the region's colorfulness, summing to 1 over the notes kept */
  weight: number;
}

/** what the colors of one region say about how it should sound */
export interface RegionSummary {
  /** notes of the region, heaviest first */
  notes: RawNote[];
  /** mean colorfulness: 0 for a region of greys, 1 for one of pure colors */
  colorfulness: number;
  /** share of the region's pixels that are near enough grey to have no hue */
  greyShare: number;
  /** mean lightness of those pixels, 0 for black and 1 for white */
  greyLightness: number;
  /** mean color */
  color: RGB;
}

// midi numbers of C1 and C7, the ends lightness 0 and 1 map to
const lowest = 24;
const highest = 96;
// regions less colorful than this have no hue worth reading
const minColorfulness = 0.02;
// pixels less colorful than this count as grey
const greyBelow = 0.1;

/** keyboard height for a lightness in [0, 1], as a midi number */
export function lightness2height(lightness: number): number {
  return lowest + (highest - lowest) * lightness;
}

/** shortest signed distance from one pitch class to another, in (-6, 6] */
export function pitchOffset(from: number, to: number): number {
  const diff = (((to - from) % 12) + 12) % 12;
  return diff > 6 ? diff - 12 : diff;
}

interface Votes {
  // colorfulness gathered in each half-slot
  mass: Float64Array;
  // hue summed as an offset from each half-slot's center, so that means stay
  // exact across the 360° wrap
  hueOffset: Float64Array;
  lightSum: Float64Array;
  colored: number;
  count: number;
  grey: number;
  greyLight: number;
  total: [number, number, number];
}

function tally(colors: Iterable<RGB>, halfBins: number): Votes {
  const votes: Votes = {
    mass: new Float64Array(halfBins),
    hueOffset: new Float64Array(halfBins),
    lightSum: new Float64Array(halfBins),
    colored: 0,
    count: 0,
    grey: 0,
    greyLight: 0,
    total: [0, 0, 0],
  };
  for (const color of colors) {
    const [red, green, blue] = color;
    const [hue, , lightness] = rgb2hsl(color);
    const colorfulness =
      (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
    const position = (hue * halfBins) / 360;
    const bin = Math.min(Math.floor(position), halfBins - 1);
    votes.mass[bin] += colorfulness;
    votes.hueOffset[bin] += colorfulness * (position - bin - 0.5);
    votes.lightSum[bin] += colorfulness * lightness;
    votes.colored += colorfulness;
    if (colorfulness < greyBelow) {
      votes.grey += 1;
      votes.greyLight += lightness;
    }
    votes.total[0] += red;
    votes.total[1] += green;
    votes.total[2] += blue;
    votes.count += 1;
  }
  return votes;
}

/**
 * Read a chord off the colors of a region.
 *
 * Every pixel votes for its hue with a weight equal to its colorfulness
 * (max − min of its channels, so 0 for any grey, white or black). The hue
 * wheel is divided into one slot per note, 12 × `cycles` of them, so with
 * `cycles: 1` a note is 30° wide and with `cycles: 2` it is 15° wide and the
 * twelve notes go around the wheel twice. Votes are collected in half-slots,
 * and each peak of that histogram, together with the half-slots that climb to
 * it, is one note: a color that straddles two slots becomes a single note
 * that leans, instead of two notes. A note's pitch is the weighted mean hue
 * of its cluster and its height is the cluster's mean lightness, taken
 * smoothly from C1 to C7.
 *
 * A region cut to be one color has one note, so `around` can add the colors
 * surrounding it: their votes are scaled to make up `share` of the total,
 * which leaves the region's own color the strongest note and fills in the
 * rest of the chord from its neighborhood.
 *
 * Clusters holding less than `minWeight` of the votes are dropped and at
 * most `maxNotes` are kept.
 */
export function summarize(
  colors: Iterable<RGB>,
  {
    minWeight,
    maxNotes,
    cycles = 1,
  }: { minWeight: number; maxNotes: number; cycles?: number },
  around?: { colors: Iterable<RGB>; share: number },
): RegionSummary {
  const halfBins = 24 * cycles;
  const own = tally(colors, halfBins);
  const { count, total } = own;
  const color = total.map((sum) => (count > 0 ? sum / count : 0)) as [
    number,
    number,
    number,
  ];
  const colorfulness = count > 0 ? own.colored / count : 0;
  const greyShare = count > 0 ? own.grey / count : 0;
  const greyLightness = own.grey > 0 ? own.greyLight / own.grey : 0.5;
  if (colorfulness < minColorfulness) {
    return { notes: [], colorfulness, greyShare, greyLightness, color };
  }

  let { mass, hueOffset, lightSum } = own;
  let colored = own.colored;
  if (around !== undefined && around.share > 0) {
    const near = tally(around.colors, halfBins);
    if (near.colored > 0) {
      const ownScale = (1 - around.share) / own.colored;
      const nearScale = around.share / near.colored;
      const blend = (first: Float64Array, second: Float64Array): Float64Array =>
        first.map((value, bin) => value * ownScale + second[bin] * nearScale);
      mass = blend(own.mass, near.mass);
      hueOffset = blend(own.hueOffset, near.hueOffset);
      lightSum = blend(own.lightSum, near.lightSum);
      colored = 1;
    }
  }

  // light smoothing keeps noise in a broad cluster from reading as two peaks
  const smooth = mass.map(
    (value, bin) =>
      value / 2 +
      (mass[(bin + 1) % halfBins] + mass[(bin + halfBins - 1) % halfBins]) / 4,
  );
  // equal neighbors are ranked by index so a flat top still has one peak
  const higher = (candidate: number, than: number): boolean =>
    smooth[candidate] > smooth[than] ||
    (smooth[candidate] === smooth[than] && candidate < than);
  const uphill = (bin: number): number => {
    const left = (bin + halfBins - 1) % halfBins;
    const right = (bin + 1) % halfBins;
    const best = higher(left, right) ? left : right;
    return higher(best, bin) ? best : bin;
  };
  const clusters = new Map<
    number,
    { mass: number; hue: number; light: number }
  >();
  for (let bin = 0; bin < halfBins; ++bin) {
    if (mass[bin] > 0) {
      let peak = bin;
      for (let next = uphill(peak); next !== peak; next = uphill(peak)) {
        peak = next;
      }
      let cluster = clusters.get(peak);
      if (cluster === undefined) {
        cluster = { mass: 0, hue: 0, light: 0 };
        clusters.set(peak, cluster);
      }
      // measured from the peak so a cluster spanning the wrap averages right
      const around = (bin - peak + halfBins) % halfBins;
      const steps = around > halfBins / 2 ? around - halfBins : around;
      cluster.mass += mass[bin];
      cluster.hue += mass[bin] * (peak + steps + 0.5) + hueOffset[bin];
      cluster.light += lightSum[bin];
    }
  }

  const kept = [...clusters.values()]
    .filter((cluster) => cluster.mass / colored >= minWeight)
    .sort((left, right) => right.mass - left.mass)
    .slice(0, maxNotes);
  const keptMass = kept.reduce((sum, cluster) => sum + cluster.mass, 0);
  const notes = kept.map((cluster): RawNote => {
    // each 30° slot is one note, and whole numbers are slot centers
    const pitch = (((cluster.hue / cluster.mass / 2 - 0.5) % 12) + 12) % 12;
    return {
      note: Math.round(pitch) % 12,
      pitch,
      height: lightness2height(cluster.light / cluster.mass),
      weight: cluster.mass / keptMass,
    };
  });
  return { notes, colorfulness, greyShare, greyLightness, color };
}
