import { expect, test } from "bun:test";
import { hsl2rgb, type RGB } from "./colors";
import { pitchOffset, summarize } from "./raw";

const options = { minWeight: 0.05, maxNotes: 4 };

function swatch(hue: number, lightness: number, count: number): RGB[] {
  return Array.from({ length: count }, () => hsl2rgb([hue, 1, lightness]));
}

test("pitchOffset takes the short way around", () => {
  expect(pitchOffset(0, 1)).toBe(1);
  expect(pitchOffset(0, 11)).toBe(-1);
  expect(pitchOffset(11, 1)).toBe(2);
  expect(pitchOffset(3, 9)).toBe(6);
});

test("a color at the center of a hue slot is one note with no lean", () => {
  const { notes } = summarize(swatch(45, 0.5, 100), options);
  expect(notes.length).toBe(1);
  expect(notes[0].note).toBe(1);
  expect(notes[0].pitch).toBeCloseTo(1, 1);
  expect(notes[0].weight).toBeCloseTo(1);
  // mid lightness asks for the middle of the keyboard
  expect(notes[0].height).toBeCloseTo(60, 0);
});

test("a color straddling two slots is one leaning note, not two", () => {
  // hues just either side of the 60° edge between slots 1 and 2
  const colors = [...swatch(56, 0.5, 60), ...swatch(63, 0.5, 40)];
  const { notes } = summarize(colors, options);
  expect(notes.length).toBe(1);
  expect(notes[0].note).toBe(1);
  expect(notes[0].pitch).toBeGreaterThan(1.3);
  expect(notes[0].pitch).toBeLessThan(1.5);
});

test("a cluster spanning the hue wrap averages across it", () => {
  const colors = [...swatch(356, 0.5, 50), ...swatch(4, 0.5, 50)];
  const { notes } = summarize(colors, options);
  expect(notes.length).toBe(1);
  // 0° is the edge between slots 11 and 0
  expect(Math.abs(pitchOffset(notes[0].pitch, 11.5))).toBeLessThan(0.1);
});

test("two distinct colors are two notes weighted by area", () => {
  const colors = [...swatch(45, 0.5, 75), ...swatch(225, 0.5, 25)];
  const { notes } = summarize(colors, options);
  expect(notes.map(({ note }) => note)).toEqual([1, 7]);
  expect(notes[0].weight).toBeCloseTo(0.75);
});

test("lightness sets the height smoothly", () => {
  const dark = summarize(swatch(45, 0.25, 10), options);
  const light = summarize(swatch(45, 0.75, 10), options);
  expect(dark.notes[0].height).toBeCloseTo(42, 0);
  expect(light.notes[0].height).toBeCloseTo(78, 0);
});

test("grey, white and black cast no hue vote", () => {
  const white: RGB[] = Array.from({ length: 90 }, () => [255, 255, 255]);
  const mixed = summarize([...white, ...swatch(45, 0.5, 10)], options);
  expect(mixed.notes.length).toBe(1);
  expect(mixed.colorfulness).toBeCloseTo(0.1);
  expect(mixed.greyShare).toBeCloseTo(0.9);
  expect(mixed.greyLightness).toBeCloseTo(1);

  const black: RGB[] = Array.from({ length: 50 }, () => [0, 0, 0]);
  const empty = summarize(black, options);
  expect(empty.notes).toEqual([]);
  expect(empty.greyLightness).toBeCloseTo(0);
});

test("with two cycles a note is 15° wide and the notes go around twice", () => {
  const twice = { ...options, cycles: 2 };
  // 52° is slot 3 of 24, and 232° is slot 15, the same note a cycle on
  expect(summarize(swatch(52, 0.5, 10), twice).notes[0].note).toBe(3);
  expect(summarize(swatch(232, 0.5, 10), twice).notes[0].note).toBe(3);
  // hues 30° apart, one note with one cycle, are two notes apart with two
  const colors = [...swatch(37, 0.5, 60), ...swatch(67, 0.5, 40)];
  expect(summarize(colors, twice).notes.map(({ note }) => note)).toEqual([
    2, 4,
  ]);
});
