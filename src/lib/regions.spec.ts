import { expect, test } from "bun:test";
import { bisected, orderedGrid } from "./regions";

function blank(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  return { width, height, data, colorSpace: "srgb" } as unknown as ImageData;
}

test("orderedGrid yields non-empty patches at an extreme aspect ratio", () => {
  // a tall sliver with few notes previously rounded nwidth to 0 (Infinity/NaN)
  const regions = [...orderedGrid(blank(4, 400), 10)];
  expect(regions.length).toBeGreaterThan(0);
  for (const { num } of regions) {
    expect(num).toBeGreaterThan(0);
  }
});

test("orderedGrid never yields an empty patch", () => {
  // cells only a few pixels wide previously came out with zero or negative size
  for (const size of [1, 3, 17, 64, 92, 257]) {
    for (const notes of [1, 7, 40, 225, 4500]) {
      const regions = [...orderedGrid(blank(size, size), notes)];
      let covered = 0;
      for (const { num } of regions) {
        expect(num).toBeGreaterThan(0);
        covered += num;
      }
      expect(covered).toBe(size * size);
    }
  }
});

test("orderedGrid yields at most one region per pixel for tiny images", () => {
  // more notes than pixels previously produced empty patches
  const regions = [...orderedGrid(blank(2, 2), 40)];
  expect(regions.length).toBe(4);
  for (const { num } of regions) {
    expect(num).toBe(1);
  }
});

function halves(width: number, height: number): ImageData {
  // left half red, right half blue
  const img = blank(width, height);
  for (let pixel = 0; pixel < width * height; ++pixel) {
    const red = pixel % width < width / 2;
    img.data.set([red ? 255 : 0, 0, red ? 0 : 255, 255], pixel * 4);
  }
  return img;
}

test("bisected cuts where the colors change", () => {
  const [left, right] = [...bisected(halves(40, 20), 2)].sort(
    (first, second) => first.center[0] - second.center[0],
  );
  expect(left.poly[1]).toEqual([20, 0]);
  expect(right.poly[0]).toEqual([20, 0]);
  expect(left.variance).toBeCloseTo(0);
});

test("bisected yields exactly the count asked for and covers the picture", () => {
  for (const count of [1, 2, 7, 40, 225]) {
    const regions = [...bisected(halves(64, 48), count)];
    expect(regions.length).toBe(count);
    expect(regions.reduce((sum, { num }) => sum + num, 0)).toBe(64 * 48);
    for (const { num } of regions) {
      expect(num).toBeGreaterThan(0);
    }
  }
  // never more regions than pixels
  expect([...bisected(blank(2, 2), 40)].length).toBe(4);
});
