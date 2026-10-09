import { expect, test } from "bun:test";
import { meanKeyTempo } from "./tempo";

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
    const bpm = meanKeyTempo(img, low, high);
    expect(bpm).toBeGreaterThanOrEqual(low);
    expect(bpm).toBeLessThanOrEqual(high);
  }
});

test("brighter images map to faster tempos", () => {
  expect(meanKeyTempo(solid(255, 255, 255))).toBeGreaterThan(
    meanKeyTempo(solid(0, 0, 0)),
  );
});
