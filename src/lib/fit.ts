/** module for fitting a song of raw chords to a key */

import { orderedNotes } from "./notes";
import { pitchOffset, type RawNote } from "./raw";

export type KeyFit = "off" | "one" | "change";

export type KeyMode = "any" | "major" | "minor";

/** how key fitting weighs each musical preference; 0 turns a preference off */
export interface FitOptions {
  /** whether to fit a key, and whether the key may change once */
  keyFit: KeyFit;
  /** which keys may be chosen */
  mode: KeyMode;
  /** cost of a note outside the key, per unit of weight */
  offKey: number;
  /** cost of leaving a note out, per unit of weight */
  drop: number;
  /** cost of playing a note an octave from where its lightness puts it */
  register: number;
  /** cost of two notes a semitone apart in one chord, per unit of weight */
  clash: number;
  /** cost of a note outside the chord's nearest triad, per unit of weight */
  triad: number;
  /** cost of following one triad with one it does not usually lead to */
  progression: number;
  /** cost of each pair of lines moving in parallel fifths or octaves */
  parallel: number;
  /** cost of the top note leaping, per octave beyond a fifth */
  leap: number;
  /** cost of the lines moving, per octave of average movement */
  movement: number;
  /** cost of ending on anything but the key's home triad */
  ending: number;
  /** cost of close notes low on the keyboard, per unit of weight and octave */
  mud: number;
  /** cost of the lowest note not being the triad's root; half for its third */
  root: number;
  /** cost of a minor key's fifth-degree triad not raising the seventh */
  minorFifth: number;
  /** cost of a leading note not rising to the home note, per unit of weight */
  leading: number;
  /** chords per phrase; 0 for no phrases */
  phrase: number;
  /** cost of a phrase closing without a cadence; half for a weak cadence */
  cadence: number;
  /** cost of the one key change */
  keyChange: number;
}

/** fit options while being edited, when a number field may be empty */
export type FitDraft = { keyFit: KeyFit; mode: KeyMode } & {
  [Name in Exclude<keyof FitOptions, "keyFit" | "mode">]: number | null;
};

/** a major or natural minor key */
export interface Key {
  /** pitch class of the home note */
  tonic: number;
  minor: boolean;
}

/** a chord after fitting */
export interface FittedChord {
  /** notes as midi numbers with their weights, heaviest first */
  notes: { midi: number; weight: number }[];
  /** key the chord was fitted to, or null when fitting is off */
  key: Key | null;
  /**
   * pitch classes of the triad the chord was read as, root first, or null for
   * a rest, a chord on no triad of its key, or when fitting is off
   */
  triad: number[] | null;
}

/** a triad of a key */
export interface Triad {
  /** scale degree of the root, counted from 0 */
  degree: number;
  /** pitch classes of the root, third and fifth */
  classes: number[];
  /** whether it takes a minor key's raised seventh */
  raised: boolean;
}

interface Option {
  // ascending
  midis: number[];
  weights: number[];
  // weight on each pitch class, and over them all
  classes: Float64Array;
  total: number;
  // cost that does not depend on the key: movement, drops, clashes and mud
  base: number;
  // place among the region's choices that some key kept
  slot: number;
}

interface Scored {
  option: Option;
  // base plus the costs that depend on the key
  local: number;
  // triad the chord is read as, or null for a rest or a chord on no triad
  triad: Triad | null;
  // scale degree of that triad, or -1
  degree: number;
  // places in the chord of leading notes that have to resolve
  leading: readonly number[];
}

interface Frame {
  // pitch classes outside the key
  offScale: number[];
  triads: Triad[];
  // pitch class a semitone below the home note
  leadingClass: number;
  // whether the key may raise its seventh
  raise: boolean;
}

// whether a chord closes a phrase, and whether that phrase is the last
type Close = "none" | "phrase" | "final";

// midi numbers of C1 and B7, the range of the piano samples
const lowest = 24;
const highest = 107;
// readings of whole chords kept per region and key
const kept = 16;
// partial chords kept while building the choices for a region with many notes
const beam = 512;
// keys this many steps apart on the circle of fifths can follow each other
const related = 2;

const majorScale = [0, 2, 4, 5, 7, 9, 11];
const minorScale = [0, 2, 3, 5, 7, 8, 10];
// from each scale degree, the degrees its triad usually moves to
const leadsTo = [
  [0, 1, 2, 3, 4, 5, 6],
  [1, 4, 6],
  [2, 5, 3],
  [3, 1, 4, 6, 0],
  [4, 0, 5],
  [5, 1, 3, 4],
  [6, 0, 2, 4],
];

// lowest midi note that can sit under an interval of one to six semitones
// without blurring: E3, Eb3, C3, Bb2, Bb2 and B2
const clearFrom = [52, 51, 48, 46, 46, 47];
// degrees whose triads pull toward the home triad
const dominants = [4, 6];
// degrees that usually come before a phrase pauses on the fifth degree
const beforeHalf = [0, 1, 3, 5];
const none: readonly number[] = [];
// slack for comparing sums of weights
const epsilon = 1e-9;

const keys: Key[] = [false, true].flatMap((minor) =>
  orderedNotes.map((_, tonic) => ({ tonic, minor })),
);

/** name of a key, like "Ab minor" */
export function keyName({ tonic, minor }: Key): string {
  return `${orderedNotes[tonic]} ${minor ? "minor" : "major"}`;
}

function scaleOf({ tonic, minor }: Key): number[] {
  return (minor ? minorScale : majorScale).map((step) => (tonic + step) % 12);
}

/** steps between two keys' signatures around the circle of fifths */
function keyDistance(first: Key, second: Key): number {
  const place = ({ tonic, minor }: Key): number =>
    (((minor ? tonic + 3 : tonic) % 12) * 7) % 12;
  const diff = Math.abs(place(first) - place(second));
  return Math.min(diff, 12 - diff);
}

/** the triads of a key, with those on a minor key's raised seventh if asked */
export function triadsOf(key: Key, raise: boolean): Triad[] {
  const scale = scaleOf(key);
  const natural = scale.map(
    (_, degree): Triad => ({
      degree,
      classes: [0, 2, 4].map((third) => scale[(degree + third) % 7]),
      raised: false,
    }),
  );
  if (raise && key.minor) {
    const raised = dominants.map(
      (degree): Triad => ({
        degree,
        classes: natural[degree].classes.map((pitchClass) =>
          pitchClass === scale[6] ? (pitchClass + 1) % 12 : pitchClass,
        ),
        raised: true,
      }),
    );
    return [...natural, ...raised];
  } else {
    return natural;
  }
}

/** the triads holding the most of a chord's weight, if any hold some */
export function nearestTriads(
  midis: readonly number[],
  weights: readonly number[],
  triads: readonly Triad[],
): Triad[] {
  const classes = new Float64Array(12);
  midis.forEach((midi, index) => {
    classes[midi % 12] += weights[index];
  });
  const within = triads.map((triad) => coverage(classes, triad));
  const most = Math.max(...within);
  return most > 0
    ? triads.filter((_, index) => within[index] >= most - epsilon)
    : [];
}

/** weight a chord puts on a triad, given its weight on each pitch class */
function coverage(
  classes: Float64Array,
  { degree, classes: [root, third, fifth], raised }: Triad,
): number {
  const within = classes[root] + classes[third] + classes[fifth];
  // a raised seventh on its own is just a note outside the key, or minor keys
  // would have eight notes to a major key's seven
  const alone =
    raised && within - classes[degree === 4 ? third : root] <= epsilon;
  return alone ? 0 : within;
}

/** 0 for a lowest note on its triad's root, 0.5 on the third, else 1 */
function inversion(lowest: number, { classes: [root, third] }: Triad): number {
  const pitchClass = lowest % 12;
  if (pitchClass === root) {
    return 0;
  } else if (pitchClass === third) {
    return 0.5;
  } else {
    return 1;
  }
}

/** weight of notes under a fifth apart, per octave below where they blur */
export function muddiness(
  midis: readonly number[],
  weights: readonly number[],
): number {
  let total = 0;
  for (let high = 1; high < midis.length; ++high) {
    for (let low = 0; low < high; ++low) {
      const interval = midis[high] - midis[low];
      if (interval >= 1 && interval <= clearFrom.length) {
        const depth = clearFrom[interval - 1] - midis[low];
        if (depth > 0) total += ((weights[high] + weights[low]) * depth) / 12;
      }
    }
  }
  return total;
}

/** weight of notes a semitone below a home note that neither rise nor hold */
export function unresolved(
  before: readonly number[],
  weights: readonly number[],
  after: readonly number[],
  tonic: number,
): number {
  const leading = before.flatMap((midi, index) =>
    (midi + 1) % 12 === tonic ? [index] : [],
  );
  return hanging(before, weights, leading, after);
}

function hanging(
  before: readonly number[],
  weights: readonly number[],
  leading: readonly number[],
  after: readonly number[],
): number {
  let total = 0;
  for (const index of leading) {
    const midi = before[index];
    if (!after.includes(midi + 1) && !after.includes(midi)) {
      total += weights[index];
    }
  }
  return total;
}

/**
 * how far a phrase's close is from a cadence, given the degrees of its last
 * two triads, or -1 for none: 0 for a full cadence, 0.5 for a weak one, else 1
 *
 * A full cadence comes home from the fifth or seventh degree, or pauses on the
 * fifth from the first, second, fourth or sixth. A weak one reaches the first
 * or fifth degree any other way, or slips from the fifth to the sixth. The
 * final close is only judged on its approach, as where it lands is the
 * business of `ending`.
 */
export function cadenceGap(
  before: number,
  after: number,
  final: boolean,
): number {
  if (final) {
    return dominants.includes(before) ? 0 : 0.5;
  } else if (after === 0) {
    return dominants.includes(before) ? 0 : 0.5;
  } else if (after === 4) {
    return beforeHalf.includes(before) ? 0 : 0.5;
  } else if (after === 5 && before === 4) {
    return 0.5;
  } else {
    return 1;
  }
}

/** the midi note of a pitch class nearest a height, within the samples */
export function place(pitchClass: number, height: number): number {
  let midi = pitchClass + 12 * Math.round((height - pitchClass) / 12);
  while (midi < lowest) midi += 12;
  while (midi > highest) midi -= 12;
  return midi;
}

/** whole-chord choices for a region, cheapest first, without regard to key */
function choices(notes: readonly RawNote[], options: FitOptions): Option[] {
  type Partial = { placed: Map<number, number>; cost: number };
  let partials: Partial[] = [{ placed: new Map<number, number>(), cost: 0 }];
  for (const { note, pitch, height, weight } of notes) {
    const next: Partial[] = [];
    for (const { placed, cost } of partials) {
      for (const shift of [0, -1, 1, -2, 2]) {
        const pitchClass = (note + shift + 12) % 12;
        // the cost is the distance from where the hue really sits, so moving
        // with the lean is cheaper than moving against it
        const moved = Math.abs(pitchOffset(pitch, pitchClass));
        for (const octave of [0, -1, 1]) {
          const midi = place(pitchClass, height + 12 * octave);
          const added = new Map(placed);
          added.set(midi, (added.get(midi) ?? 0) + weight);
          next.push({
            placed: added,
            cost: cost + weight * (moved + options.register * Math.abs(octave)),
          });
        }
      }
      next.push({ placed, cost: cost + weight * options.drop });
    }
    next.sort((left, right) => left.cost - right.cost);
    partials = next.slice(0, beam);
  }

  const unique = new Map<string, Option>();
  for (const { placed, cost } of partials) {
    const midis = [...placed.keys()].sort((left, right) => left - right);
    const weights = midis.map((midi) => placed.get(midi) ?? 0);
    let clashes = 0;
    for (let high = 1; high < midis.length; ++high) {
      for (let low = 0; low < high; ++low) {
        const interval = (midis[high] - midis[low]) % 12;
        if (interval === 1 || interval === 11) {
          clashes += weights[high] + weights[low];
        }
      }
    }
    const base =
      cost + options.clash * clashes + options.mud * muddiness(midis, weights);
    const id = midis.join(",");
    const known = unique.get(id);
    if (known === undefined || base < known.base) {
      const classes = new Float64Array(12);
      let total = 0;
      midis.forEach((midi, index) => {
        classes[midi % 12] += weights[index];
        total += weights[index];
      });
      unique.set(id, { midis, weights, classes, total, base, slot: -1 });
    }
  }
  return [...unique.values()];
}

/** what scoring a chord needs to know about a key */
function frameOf(key: Key, options: FitOptions): Frame {
  const scale = scaleOf(key);
  const raise = key.minor && options.minorFifth > 0;
  return {
    offScale: orderedNotes.flatMap((_, pitchClass) =>
      scale.includes(pitchClass) ? [] : [pitchClass],
    ),
    triads: triadsOf(key, raise),
    leadingClass: (key.tonic + 11) % 12,
    raise,
  };
}

/**
 * the cheapest few readings of a region's choices once the key's costs are added
 *
 * a chord is read as the triad holding the most of its weight, and when
 * several tie, as a lone note does between three, each is its own reading
 */
function score(
  candidates: readonly Option[],
  { offScale, triads, leadingClass, raise }: Frame,
  options: FitOptions,
  last: boolean,
): Scored[] {
  const within = new Float64Array(triads.length);
  const best: Scored[] = [];
  let worst = Number.POSITIVE_INFINITY;
  const keep = (
    option: Option,
    local: number,
    triad: Triad | null,
    leading: readonly number[],
  ): void => {
    let at = best.length;
    while (at > 0 && best[at - 1].local > local) at -= 1;
    const degree = triad === null ? -1 : triad.degree;
    best.splice(at, 0, { option, local, triad, degree, leading });
    if (best.length > kept) best.pop();
    if (best.length === kept) worst = best[kept - 1].local;
  };

  for (const option of candidates) {
    const { midis, classes, total, base } = option;
    let outside = 0;
    for (const pitchClass of offScale) outside += classes[pitchClass];
    const spared = raise ? classes[leadingClass] : 0;
    // no reading can cost less than this, so most choices skip the triad work
    if (base + options.offKey * (outside - spared) < worst) {
      let most = 0;
      for (let index = 0; index < triads.length; ++index) {
        within[index] = coverage(classes, triads[index]);
        if (within[index] > most) most = within[index];
      }
      if (most > 0) {
        for (let index = 0; index < triads.length; ++index) {
          const triad = triads[index];
          const { degree, raised } = triad;
          const local =
            base +
            options.offKey * (raised ? outside - spared : outside) +
            options.triad * (total - within[index]) +
            options.root * inversion(midis[0], triad) +
            (raise && degree === 4 && !raised ? options.minorFifth : 0) +
            (last && degree !== 0 ? options.ending : 0);
          if (within[index] >= most - epsilon && local < worst) {
            const leading =
              options.leading > 0 &&
              dominants.includes(degree) &&
              triad.classes.includes(leadingClass)
                ? midis.flatMap((midi, place) =>
                    midi % 12 === leadingClass ? [place] : [],
                  )
                : none;
            keep(option, local, triad, leading);
          }
        }
      } else {
        const local =
          base +
          options.offKey * outside +
          options.triad * total +
          (last ? options.ending : 0);
        if (local < worst) keep(option, local, null, none);
      }
    }
  }
  return best;
}

/**
 * pairs of notes that carry on from one chord into the next
 *
 * chords here are bare sets of notes, so lines are made by reading both low to
 * high: the bottom notes pair off in order and the top notes always pair.
 */
function lines(
  before: readonly number[],
  after: readonly number[],
): number[][] {
  const count = Math.min(before.length, after.length);
  const pairs: number[][] = [];
  for (let index = 0; index < count - 1; ++index) {
    pairs.push([before[index], after[index]]);
  }
  if (count > 0) {
    pairs.push([before[before.length - 1], after[after.length - 1]]);
  }
  return pairs;
}

/** count pairs of lines that move in parallel fifths or octaves */
export function parallels(
  before: readonly number[],
  after: readonly number[],
): number {
  const pairs = lines(before, after);
  let hits = 0;
  for (let upper = 1; upper < pairs.length; ++upper) {
    for (let lower = 0; lower < upper; ++lower) {
      const [lowFrom, lowTo] = pairs[lower];
      const [highFrom, highTo] = pairs[upper];
      const interval = (highFrom - lowFrom) % 12;
      const moved = lowTo - lowFrom;
      if (
        (interval === 7 || interval === 0) &&
        (highTo - lowTo) % 12 === interval &&
        moved !== 0 &&
        Math.sign(highTo - highFrom) === Math.sign(moved)
      ) {
        hits += 1;
      }
    }
  }
  return hits;
}

/** cost of how the notes of one chord move to the next */
function motion(from: Option, to: Option, options: FitOptions): number {
  const before = from.midis;
  const after = to.midis;
  if (before.length === 0 || after.length === 0) {
    return 0;
  } else {
    const pairs = lines(before, after);
    const travel =
      pairs.reduce((sum, [start, end]) => sum + Math.abs(end - start), 0) /
      pairs.length;
    const jump = Math.abs(after[after.length - 1] - before[before.length - 1]);
    return (
      options.parallel * parallels(before, after) +
      (options.leap * Math.max(0, jump - 7)) / 12 +
      (options.movement * travel) / 12
    );
  }
}

/** cost of how one chord's triad leads to the next within a key */
function harmony(
  before: Scored,
  after: Scored,
  close: Close,
  options: FitOptions,
): number {
  const weak =
    before.degree >= 0 &&
    after.degree >= 0 &&
    before.degree !== after.degree &&
    !leadsTo[before.degree].includes(after.degree);
  const left =
    before.leading.length > 0
      ? hanging(
          before.option.midis,
          before.option.weights,
          before.leading,
          after.option.midis,
        )
      : 0;
  return (
    (weak ? options.progression : 0) +
    options.leading * left +
    closing(before.degree, after.degree, close, options)
  );
}

function closing(
  before: number,
  after: number,
  close: Close,
  options: FitOptions,
): number {
  return close === "none"
    ? 0
    : options.cadence * cadenceGap(before, after, close === "final");
}

function unfitted(song: readonly (readonly RawNote[])[]): FittedChord[] {
  return song.map((notes) => {
    const placed = new Map<number, number>();
    for (const { note, height, weight } of notes) {
      const midi = place(note, height);
      placed.set(midi, (placed.get(midi) ?? 0) + weight);
    }
    return { notes: byWeight(placed.entries()), key: null, triad: null };
  });
}

function byWeight(
  entries: Iterable<[number, number]>,
): { midi: number; weight: number }[] {
  return [...entries]
    .map(([midi, weight]) => ({ midi, weight }))
    .sort((left, right) => right.weight - left.weight);
}

/**
 * Fit a song of raw chords to a key.
 *
 * Each note may stay, move up to two semitones either way, move an octave
 * either way, or drop out; a chord is one such choice per note, read as the
 * triad of the key that holds the most of its weight. Dynamic programming
 * over the song picks the chords, their triads and the key that together cost
 * least, where the cost is how far notes moved from their hues plus a penalty
 * for each musical preference in `options` that the result breaks:
 *
 * - in one chord: notes outside the key or the triad, semitone clashes, close
 *   intervals low on the keyboard, a lowest note other than the triad's root,
 *   dropped notes and octave shifts;
 * - from one chord to the next: weak triad progressions, parallel fifths and
 *   octaves, leaps in the top note, busy movement, and a leading note that
 *   does not rise to the home note;
 * - over the song: every `phrase` chords, and at the end, a close without a
 *   cadence (see {@link cadenceGap}), and an ending off the home triad.
 *
 * A chord with few notes sits equally on several triads, and then the triad is
 * chosen like the notes are; {@link FittedChord.triad} reports it.
 *
 * With `keyFit: "one"` every major and natural minor key is tried and the
 * cheapest kept; a `minorFifth` above 0 also lets a minor key raise its
 * seventh in the triads on its fifth and seventh degrees, where the raised
 * note is then in key and is the leading note. With `"change"` the key may also
 * change once, to a nearby key, at the cost of `keyChange`. With `"off"` the
 * raw chords are returned.
 *
 * ```ts
 * const chords = fit(song, { ...options, keyFit: "one" });
 * const name = chords[0].key && keyName(chords[0].key);
 * ```
 */
export function fit(
  song: readonly (readonly RawNote[])[],
  options: FitOptions,
): FittedChord[] {
  if (options.keyFit === "off" || song.length === 0) {
    return unfitted(song);
  }
  const length = song.length;
  const candidates = song.map((notes) => choices(notes, options));
  const scored = keys.map((key) => {
    const frame = frameOf(key, options);
    // a key outside the mode keeps no choices, so no path can pass through it
    const allowed =
      options.mode === "any" || (options.mode === "minor") === key.minor;
    return candidates.map((region, index) =>
      allowed ? score(region, frame, options, index === length - 1) : [],
    );
  });
  // the choices of each region that some key kept, each knowing its place
  const used = candidates.map((_, time) => {
    const chosen: Option[] = [];
    for (const perKey of scored) {
      for (const { option } of perKey[time]) {
        if (option.slot < 0) {
          option.slot = chosen.length;
          chosen.push(option);
        }
      }
    }
    return chosen;
  });
  const phrase = options.cadence > 0 ? Math.round(options.phrase) : 0;
  const closeAt = (time: number): Close => {
    if (phrase <= 0) {
      return "none";
    } else if (time === length - 1) {
      return "final";
    } else {
      return (time + 1) % phrase === 0 ? "phrase" : "none";
    }
  };
  const change = options.keyFit === "change";
  const neighbors = keys.map((key, index) =>
    keys.flatMap((other, otherIndex) =>
      change && otherIndex !== index && keyDistance(key, other) <= related
        ? [otherIndex]
        : [],
    ),
  );

  // a state is (changed yet?, key, reading); costs and back pointers are kept
  // in flat arrays indexed by state
  const phases = change ? 2 : 1;
  const states = phases * keys.length * kept;
  const index = (phase: number, key: number, choice: number): number =>
    (phase * keys.length + key) * kept + choice;
  let costs = new Float64Array(states).fill(Number.POSITIVE_INFINITY);
  const back: Int32Array[] = [];
  keys.forEach((_, key) => {
    scored[key][0].forEach(({ local }, choice) => {
      costs[index(0, key, choice)] = local;
    });
  });

  for (let time = 1; time < length; ++time) {
    const next = new Float64Array(states).fill(Number.POSITIVE_INFINITY);
    const from = new Int32Array(states).fill(-1);
    const close = closeAt(time);
    // how the notes move depends only on the two chords, which keys share
    const sources = used[time - 1];
    const width = used[time].length;
    const moves = new Float64Array(sources.length * width).fill(Number.NaN);
    const moved = (source: Option, target: Option): number => {
      const cell = source.slot * width + target.slot;
      if (Number.isNaN(moves[cell])) {
        moves[cell] = motion(source, target, options);
      }
      return moves[cell];
    };
    // cheapest way to hold each earlier chord in a nearby key, not yet changed
    const reach = new Float64Array(sources.length);
    const reached = new Int32Array(sources.length);
    for (let key = 0; key < keys.length; ++key) {
      const before = scored[key][time - 1];
      const after = scored[key][time];
      reach.fill(Number.POSITIVE_INFINITY);
      for (const other of neighbors[key]) {
        scored[other][time - 1].forEach(({ option }, prior) => {
          const previous = index(0, other, prior);
          if (costs[previous] < reach[option.slot]) {
            reach[option.slot] = costs[previous];
            reached[option.slot] = previous;
          }
        });
      }
      after.forEach((target, choice) => {
        before.forEach((source, prior) => {
          const link =
            moved(source.option, target.option) +
            harmony(source, target, close, options);
          for (let phase = 0; phase < phases; ++phase) {
            const state = index(phase, key, choice);
            const previous = index(phase, key, prior);
            const total = costs[previous] + link;
            if (total < next[state]) {
              next[state] = total;
              from[state] = previous;
            }
          }
        });
        if (neighbors[key].length > 0) {
          const state = index(1, key, choice);
          const arrival =
            options.keyChange + closing(-1, target.degree, close, options);
          sources.forEach((source, slot) => {
            if (reach[slot] < Number.POSITIVE_INFINITY) {
              const total =
                reach[slot] + arrival + moved(source, target.option);
              if (total < next[state]) {
                next[state] = total;
                from[state] = reached[slot];
              }
            }
          });
        }
        for (let phase = 0; phase < phases; ++phase) {
          next[index(phase, key, choice)] += target.local;
        }
      });
    }
    costs = next;
    back.push(from);
  }

  let state = 0;
  for (let candidate = 1; candidate < states; ++candidate) {
    if (costs[candidate] < costs[state]) state = candidate;
  }
  const chords: FittedChord[] = new Array<FittedChord>(length);
  for (let time = length - 1; time >= 0; --time) {
    const key = Math.floor(state / kept) % keys.length;
    const { option, triad } = scored[key][time][state % kept];
    chords[time] = {
      notes: byWeight(
        option.midis.map((midi, at) => [midi, option.weights[at]]),
      ),
      key: keys[key],
      triad: triad === null ? null : [...triad.classes],
    };
    if (time > 0) state = back[time - 1][state];
  }
  return chords;
}
