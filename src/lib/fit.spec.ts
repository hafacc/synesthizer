import { expect, test } from "bun:test";
import {
  cadenceGap,
  type FitOptions,
  fit,
  keyName,
  muddiness,
  nearestTriads,
  parallels,
  triadsOf,
  unresolved,
} from "./fit";
import type { RawNote } from "./raw";

const off: FitOptions = {
  keyFit: "one",
  mode: "any",
  offKey: 0,
  drop: 2,
  register: 0.5,
  clash: 0,
  triad: 0,
  progression: 0,
  parallel: 0,
  leap: 0,
  movement: 0,
  ending: 0,
  mud: 0,
  root: 0,
  minorFifth: 0,
  leading: 0,
  phrase: 0,
  cadence: 0,
  keyChange: 3,
};
const inKey: FitOptions = { ...off, offKey: 4 };

/** a note sitting on a pitch class, leaning `lean` semitones up or down */
function raw(note: number, weight: number, lean = 0, height = 60): RawNote {
  return { note, pitch: (note + lean + 12) % 12, height, weight };
}

function chord(...notes: number[]): RawNote[] {
  return notes.map((note) => raw(note, 1 / notes.length));
}

function classes(notes: readonly { midi: number }[]): number[] {
  return notes.map(({ midi }) => midi % 12).sort((left, right) => left - right);
}

const cadence = [
  chord(0, 4, 7),
  chord(5, 9, 0),
  chord(7, 11, 2),
  chord(0, 4, 7),
];

test("fitting off returns the raw notes near their heights", () => {
  const [first] = fit([[raw(1, 0.6, 0.4, 61), raw(8, 0.4, 0, 40)]], {
    ...inKey,
    keyFit: "off",
  });
  expect(first.key).toBeNull();
  expect(first.notes).toEqual([
    { midi: 61, weight: 0.6 },
    { midi: 44, weight: 0.4 },
  ]);
});

test("a song already in a key is left alone and its key is found", () => {
  const chords = fit(cadence, { ...inKey, triad: 1, ending: 1 });
  expect(chords.map(({ notes }) => classes(notes))).toEqual([
    [0, 4, 7],
    [0, 5, 9],
    [2, 7, 11],
    [0, 4, 7],
  ]);
  for (const { key } of chords) {
    expect(key && keyName(key)).toBe("C major");
  }
});

test("an off-key note moves the way it leans", () => {
  const up = fit([...cadence, [raw(1, 1, 0.4)], ...cadence], inKey);
  expect(classes(up[4].notes)).toEqual([2]);
  const down = fit([...cadence, [raw(1, 1, -0.4)], ...cadence], inKey);
  expect(classes(down[4].notes)).toEqual([0]);
});

test("moving with the lean costs less than moving against it", () => {
  // Db leaning toward D, in C major: D is 0.6 away and C is 1.4
  const [chord] = fit([...cadence, [raw(1, 1, 0.4)]], inKey).slice(-1);
  expect(classes(chord.notes)).toEqual([2]);
});

test("with every penalty at zero nothing moves", () => {
  const chords = fit([...cadence, [raw(1, 0.5, 0.4), raw(6, 0.5)]], off);
  expect(classes(chords[4].notes)).toEqual([1, 6]);
});

test("a semitone clash is resolved toward the lean when it is penalized", () => {
  const clashing = [raw(0, 0.6), raw(1, 0.4, 0.45)];
  const kept = fit([clashing], off);
  expect(classes(kept[0].notes)).toEqual([0, 1]);
  const resolved = fit([clashing], { ...off, clash: 1 });
  expect(classes(resolved[0].notes)).toEqual([0, 2]);
});

test("a note outside the triad moves onto it when that is penalized", () => {
  // F sits in C major, so only the triad penalty can move it
  const notes = [raw(0, 0.5), raw(4, 0.3), raw(5, 0.2, -0.4)];
  const song = [...cadence, notes, ...cadence];
  expect(classes(fit(song, inKey)[4].notes)).toEqual([0, 4, 5]);
  expect(classes(fit(song, { ...inKey, triad: 2 })[4].notes)).toEqual([0, 4]);
});

test("parallels counts lines moving together a fifth or octave apart", () => {
  expect(parallels([60, 67], [62, 69])).toBe(1);
  expect(parallels([60, 72], [62, 74])).toBe(1);
  // contrary motion and held notes are fine
  expect(parallels([60, 67], [59, 69])).toBe(0);
  expect(parallels([60, 67], [60, 67])).toBe(0);
  expect(parallels([60, 64], [62, 65])).toBe(0);
});

test("parallel fifths are avoided when they are penalized", () => {
  // C+G then D+A, each leaning a little so that one of them can give way
  const song = [
    [raw(0, 0.5), raw(7, 0.5, 0, 67)],
    [raw(2, 0.5, 0.3), raw(9, 0.5, -0.3, 69)],
  ];
  const midis = (chords: ReturnType<typeof fit>): number[][] =>
    chords.map(({ notes }) =>
      notes.map(({ midi }) => midi).sort((left, right) => left - right),
    );
  const [before, after] = midis(fit(song, off));
  expect(parallels(before, after)).toBe(1);
  const [fixedBefore, fixedAfter] = midis(fit(song, { ...off, parallel: 5 }));
  expect(parallels(fixedBefore, fixedAfter)).toBe(0);
});

test("the key changes once only when that is allowed", () => {
  const inD = cadence.map((notes) =>
    notes.map((note) => raw((note.note + 2) % 12, note.weight)),
  );
  const song = [...cadence, ...cadence, ...inD, ...inD];
  const names = (chords: ReturnType<typeof fit>): string[] => [
    ...new Set(chords.map(({ key }) => (key ? keyName(key) : "none"))),
  ];
  expect(names(fit(song, inKey)).length).toBe(1);
  const changed = fit(song, { ...inKey, keyFit: "change", keyChange: 1 });
  expect(names(changed)).toEqual(["C major", "D major"]);
  expect(classes(changed[12].notes)).toEqual([2, 6, 9]);
});

test("the ending penalty pulls the last chord home", () => {
  // ends on C+F+G with F heaviest, which reads as the triad on F until the
  // F gives way to the E it leans toward
  const last = [raw(5, 0.5, -0.45), raw(0, 0.3), raw(7, 0.2)];
  const song = [...cadence, last];
  expect(classes(fit(song, inKey)[4].notes)).toEqual([0, 5, 7]);
  const ended = fit(song, { ...inKey, ending: 5 });
  expect(classes(ended[4].notes)).toEqual([0, 4, 7]);
});

function sorted(notes: readonly { midi: number }[]): number[] {
  return notes.map(({ midi }) => midi).sort((left, right) => left - right);
}

test("each chord reports the triad it was read as", () => {
  const chords = fit([...cadence, []], inKey);
  expect(chords.map(({ triad }) => triad)).toEqual([
    [0, 4, 7],
    [5, 9, 0],
    [7, 11, 2],
    [0, 4, 7],
    null,
  ]);
  const [raw] = fit(cadence, { ...inKey, keyFit: "off" });
  expect(raw.triad).toBeNull();
});

test("a lone note sits on three triads and a chord on the one holding most", () => {
  const triads = triadsOf({ tonic: 0, minor: false }, false);
  const degrees = (midis: number[], weights: number[]): number[] =>
    nearestTriads(midis, weights, triads).map(({ degree }) => degree);
  expect(degrees([67], [1])).toEqual([0, 2, 4]);
  expect(degrees([60, 64], [0.5, 0.5])).toEqual([0, 5]);
  expect(degrees([60, 64, 67, 69], [0.4, 0.2, 0.3, 0.1])).toEqual([0]);
  expect(degrees([61], [1])).toEqual([]);
});

test("a lone note is read as the triad that suits the song", () => {
  // a G can end the song on the home triad, as its fifth
  const song = [...cadence, chord(7)];
  expect(fit(song, { ...inKey, ending: 1 })[4].triad).toEqual([0, 4, 7]);
  // but with the lowest note wanted as the root, it is the triad on G
  expect(fit(song, { ...inKey, root: 1 })[4].triad).toEqual([7, 11, 2]);
  expect(classes(fit(song, { ...inKey, root: 1, ending: 1 })[4].notes)).toEqual(
    [7],
  );
});

test("muddiness counts close intervals low on the keyboard", () => {
  // a third on C2 is an octave too low
  expect(muddiness([36, 40], [0.5, 0.5])).toBeCloseTo(10 / 12);
  expect(muddiness([36, 43], [0.5, 0.5])).toBe(0);
  expect(muddiness([60, 64], [0.5, 0.5])).toBe(0);
  expect(muddiness([36], [1])).toBe(0);
});

test("a low close interval is spread out when mud is penalized", () => {
  const low = [raw(0, 0.5, 0, 36), raw(4, 0.5, 0, 40)];
  expect(sorted(fit([low], off)[0].notes)).toEqual([36, 40]);
  const [spread] = fit([low], { ...off, mud: 2 });
  expect(muddiness(sorted(spread.notes), [0.5, 0.5])).toBe(0);
  expect(classes(spread.notes)).toEqual([0, 4]);
});

test("the root moves to the bottom when that is penalized", () => {
  const inverted = [raw(4, 0.3, 0, 52), raw(0, 0.4, 0, 60), raw(7, 0.3, 0, 67)];
  const song = [...cadence, inverted, ...cadence];
  expect(sorted(fit(song, inKey)[4].notes)[0] % 12).toBe(4);
  const rooted = fit(song, { ...inKey, root: 2 })[4];
  expect(sorted(rooted.notes)[0] % 12).toBe(0);
  expect(classes(rooted.notes)).toEqual([0, 4, 7]);
  // a lone note is the root of one of its triads, so it is left alone
  const alone = fit([...cadence, chord(4), ...cadence], { ...inKey, root: 2 });
  expect(sorted(alone[4].notes)).toEqual([64]);
  expect(alone[4].triad).toEqual([4, 7, 11]);
});

test("a minor key raises its seventh on the fifth degree when asked", () => {
  // A minor, C major, D minor, then E major with a G# leaning toward G
  const song = [
    chord(9, 0, 4),
    chord(0, 4, 7),
    chord(2, 5, 9),
    [raw(4, 0.4), raw(8, 0.3, -0.3), raw(11, 0.3)],
    chord(9, 0, 4),
  ];
  const natural = fit(song, { ...inKey, ending: 1 });
  expect(classes(natural[3].notes)).toEqual([4, 7, 11]);
  const raised = fit(song, { ...inKey, ending: 1, minorFifth: 1 });
  expect(classes(raised[3].notes)).toEqual([4, 8, 11]);
  expect(raised[3].triad).toEqual([4, 8, 11]);
  expect(raised[3].key && keyName(raised[3].key)).toBe("A minor");
  // a lone E at the bottom of its triad is read as the raised one too
  const lone = fit([...song.slice(0, 3), chord(4), song[4]], {
    ...inKey,
    ending: 1,
    root: 1,
    minorFifth: 1,
  });
  expect(lone[3].triad).toEqual([4, 8, 11]);
  // but a raised seventh with none of its triad beside it is on no triad
  const triads = triadsOf({ tonic: 9, minor: true }, true);
  expect(nearestTriads([68], [1], triads)).toEqual([]);
  expect(nearestTriads([64, 68], [0.5, 0.5], triads)).toEqual([triads[7]]);
});

test("unresolved weighs leading notes that neither rise nor hold", () => {
  expect(unresolved([55, 71], [0.6, 0.4], [60, 72], 0)).toBe(0);
  expect(unresolved([55, 71], [0.6, 0.4], [55, 71], 0)).toBe(0);
  expect(unresolved([55, 71], [0.6, 0.4], [60, 64], 0)).toBeCloseTo(0.4);
  expect(unresolved([55, 69], [0.6, 0.4], [60, 64], 0)).toBe(0);
});

test("a leading note rises to the home note when that is penalized", () => {
  const song = [
    ...cadence,
    [raw(7, 0.4, 0, 55), raw(2, 0.3, 0, 62), raw(11, 0.3, 0, 71)],
    [raw(0, 0.4, 0, 60), raw(4, 0.3, 0, 64), raw(7, 0.3, 0, 67)],
  ];
  const left = (chords: ReturnType<typeof fit>): number =>
    unresolved(sorted(chords[4].notes), [1, 1, 1], sorted(chords[5].notes), 0);
  // the ending keeps the song from being read in A minor, where the triad on
  // G has no leading note
  const plain = fit(song, { ...inKey, ending: 1 });
  expect(left(plain)).toBe(1);
  const resolved = fit(song, { ...inKey, ending: 1, leading: 4 });
  expect(left(resolved)).toBe(0);
  expect(classes(resolved[4].notes)).toEqual([2, 7, 11]);
  // the cadence's own leading note already rises, so nothing else changed
  expect(resolved.slice(0, 4)).toEqual(plain.slice(0, 4));
});

test("cadenceGap grades how a phrase closes", () => {
  expect(cadenceGap(4, 0, false)).toBe(0);
  expect(cadenceGap(6, 0, false)).toBe(0);
  expect(cadenceGap(1, 4, false)).toBe(0);
  expect(cadenceGap(3, 0, false)).toBe(0.5);
  expect(cadenceGap(4, 5, false)).toBe(0.5);
  expect(cadenceGap(2, 4, false)).toBe(0.5);
  expect(cadenceGap(-1, 0, false)).toBe(0.5);
  expect(cadenceGap(0, 3, false)).toBe(1);
  expect(cadenceGap(0, -1, false)).toBe(1);
  // only the approach counts at the very end
  expect(cadenceGap(4, 5, true)).toBe(0);
  expect(cadenceGap(3, 0, true)).toBe(0.5);
});

test("a phrase closes on a cadence when that is penalized", () => {
  // the fourth chord is E minor with a B leaning toward C, which would bring
  // it home from the triad on G
  const close = [raw(4, 0.3), raw(7, 0.4), raw(11, 0.3, 0.45)];
  const song = [...cadence.slice(0, 3), close, ...cadence];
  // the ending keeps the song from being read in A minor, where E minor is
  // the triad on the fifth degree
  const home: FitOptions = { ...inKey, ending: 1 };
  expect(classes(fit(song, home)[3].notes)).toEqual([4, 7, 11]);
  const phrased = fit(song, { ...home, phrase: 4, cadence: 2 });
  expect(classes(phrased[3].notes)).toEqual([0, 4, 7]);
  expect(phrased[3].triad).toEqual([0, 4, 7]);
  // with no phrase length there are no closes to judge
  const unphrased = fit(song, { ...home, phrase: 0, cadence: 2 });
  expect(classes(unphrased[3].notes)).toEqual([4, 7, 11]);
  // and a chord in the middle of a phrase is left alone
  const longer = fit(song, { ...home, phrase: 8, cadence: 2 });
  expect(classes(longer[3].notes)).toEqual([4, 7, 11]);
});

test("the last chord is approached from the fifth degree when cadences are penalized", () => {
  // the chord before the end is a lone D, on the triads on D, G and B
  const song = [...cadence, chord(5, 9, 0), chord(2), chord(0, 4, 7)];
  const phrased = fit(song, { ...inKey, ending: 1, phrase: 16, cadence: 2 });
  expect([7, 11]).toContain(phrased[5].triad?.[0] ?? -1);
});

test("the mode limits which keys can be chosen", () => {
  const names = (mode: FitOptions["mode"]): string[] => [
    ...new Set(
      fit(cadence, { ...inKey, mode }).map(({ key }) =>
        key ? keyName(key) : "none",
      ),
    ),
  ];
  expect(names("any")).toEqual(["C major"]);
  expect(names("major")).toEqual(["C major"]);
  // the same seven notes, read from their minor home
  expect(names("minor")).toEqual(["A minor"]);
});
