import { expect, test } from "bun:test";
import { softVelocity, strikes, toAbc } from "./score";
import type { Chord } from "./worker-interface";

function chord(
  notes: string[],
  beats = 1,
  key: string | null = "C major",
  soft: string[] = [],
): Chord {
  return {
    id: notes.join(),
    notes,
    soft,
    velocity: 0.8,
    key,
    sharps: false,
    duration: beats * 1000,
    color: "#000000",
    poly: [],
    center: [0, 0],
  };
}

function voice(abc: string, name: string): string {
  const line = abc.split("\n").find((text) => text.startsWith(`[V:${name}]`));
  return (line ?? "").slice(6);
}

test("strikes times each note and marks quiet ones", () => {
  const song = [chord(["C4", "E4"], 1, null, ["C2"]), chord(["G4"], 2)];
  expect(strikes(song, false)).toEqual([
    { note: "C4", start: 0, length: 1, velocity: 0.8 },
    { note: "E4", start: 0, length: 1, velocity: 0.8 },
    { note: "C2", start: 0, length: 1, velocity: softVelocity },
    { note: "G4", start: 1, length: 2, velocity: 0.8 },
  ]);
});

test("strikes holds a note shared by consecutive chords", () => {
  const song = [chord(["C4", "E4"]), chord(["C4", "G4"]), chord(["C4"])];
  const held = strikes(song, true);
  expect(held.find(({ note }) => note === "C4")).toEqual({
    note: "C4",
    start: 0,
    length: 3,
    velocity: 0.8,
  });
  expect(held.length).toBe(3);
  expect(strikes(song, false).length).toBe(5);
});

test("toAbc splits notes between the staves and fills empty beats with rests", () => {
  const abc = toAbc([chord(["C4", "E5"]), chord(["G3"])], 60);
  expect(abc).toContain("Q:1/4=60");
  expect(abc).toContain("K:C");
  expect(voice(abc, "1")).toBe("[Ce]2 z2 |]");
  expect(voice(abc, "2")).toBe("z2 [G,]2 |]");
});

test("toAbc leaves out accidentals the key signature already gives", () => {
  // D major has F sharp and C sharp
  const song = [
    chord(["Gb4", "Db5"], 1, "D major"),
    chord(["F4"], 1, "D major"),
  ];
  const abc = toAbc(song, 60);
  expect(abc).toContain("K:D");
  expect(voice(abc, "1")).toBe("[Fc]2 [=F]2 |]");
});

test("toAbc carries an accidental through its bar and drops it at the bar line", () => {
  const song = [chord(["Db4"], 2), chord(["Db4"], 2), chord(["Db4"], 2)];
  expect(voice(toAbc(song, 60), "1")).toBe("[_D]4 [D]4 | [_D]4 |]");
});

test("toAbc ties a chord over the bar line", () => {
  const song = [chord(["C4"], 2), chord(["E4"], 4)];
  expect(voice(toAbc(song, 60), "1")).toBe("[C]4 [E]4- | [E]4 |]");
});

test("toAbc writes awkward lengths as tied notes", () => {
  // five eighths is not one note
  const song = [chord(["C4"], 2.5), chord(["E4"], 1.5)];
  expect(voice(toAbc(song, 60), "1")).toBe("[C]4- [C] [E]3 |]");
});

test("toAbc changes the key signature when the key changes", () => {
  const song = [chord(["C4"], 4), chord(["Gb4"], 4, "G major")];
  const abc = toAbc(song, 60);
  expect(voice(abc, "1")).toBe("[C]8 | [K:G][F]8 |]");
});

test("toAbc spells flat keys with flats and minor keys by name", () => {
  const song = [chord(["Eb4", "Bb4"], 1, "C minor")];
  const abc = toAbc(song, 60);
  expect(abc).toContain("K:Cm");
  expect(voice(abc, "1")).toBe("[EB]2 |]");
});
