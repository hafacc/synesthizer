import { expect, test } from "bun:test";
import { colorfulTempo, edgeTempo, meanKeyTempo } from "./tempo";

function solid(red: number, green: number, blue: number): ImageData {
  const width = 4;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; ++i) {
    data[i * 4] = red;
    data[i * 4 + 1] = green;
    data[i * 4 + 2] = blue;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data, colorSpace: "srgb" } as unknown as ImageData;
}

test("meanKeyTempo stays within [low, high]", () => {
  const low = 25;
  const high = 450;
  for (const img of [
    solid(0, 0, 0),
    solid(255, 255, 255),
    solid(255, 0, 0),
    solid(0, 128, 200),
  ]) {
    const bpm = meanKeyTempo(img);
    expect(bpm).toBeGreaterThanOrEqual(low);
    expect(bpm).toBeLessThanOrEqual(high);
  }
});

test("brighter images map to faster tempos", () => {
  expect(meanKeyTempo(solid(255, 255, 255))).toBeGreaterThan(
    meanKeyTempo(solid(0, 0, 0)),
  );
});

function checker(size: number, cell: number, contrast: number): ImageData {
  const img = solid(128, 128, 128);
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let pixel = 0; pixel < size * size; ++pixel) {
    const dark =
      (Math.floor((pixel % size) / cell) + Math.floor(pixel / size / cell)) %
        2 ===
      0;
    data.fill(128 + (dark ? -contrast : contrast), pixel * 4, pixel * 4 + 3);
  }
  return { ...img, width: size, height: size, data } as unknown as ImageData;
}

test("a busier picture has a faster edge tempo", () => {
  const flat = edgeTempo(solid(90, 120, 200));
  const coarse = edgeTempo(checker(64, 16, 60));
  const fine = edgeTempo(checker(64, 2, 60));
  expect(flat).toBe(25);
  expect(coarse).toBeGreaterThan(flat);
  expect(fine).toBeGreaterThan(coarse);
});

test("a more colorful picture has a faster colorfulness tempo", () => {
  expect(colorfulTempo(solid(128, 128, 128))).toBe(25);
  expect(colorfulTempo(solid(140, 110, 100))).toBeGreaterThan(25);
  expect(colorfulTempo(solid(255, 0, 0))).toBe(450);
});
