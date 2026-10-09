import { expect, test } from "bun:test";
import { type OrderMethod, order } from "./order";
import type { Region } from "./regions";

/** a minimal region; only center and variance matter to ordering */
function region(center: [number, number], variance: number): Region {
  return { center, variance, colors: [], num: 0, poly: [] };
}

/** a row-major grid whose only colorful (focal) cell is at [focalRow, focalCol] */
function grid(
  rows: number,
  cols: number,
  focalRow: number,
  focalCol: number,
): Region[] {
  const items: Region[] = [];
  for (let row = 0; row < rows; ++row) {
    for (let col = 0; col < cols; ++col) {
      items.push(
        region([col, row], row === focalRow && col === focalCol ? 1 : 0),
      );
    }
  }
  return items;
}

function sortedCenters(regions: readonly Region[]): [number, number][] {
  return regions
    .map((reg) => reg.center)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

test("word order recovers reading order from jittered rows", () => {
  // y values jitter within a row but stay well inside the unit spacing
  const items = [
    region([2, 0.1], 0),
    region([0, 0.0], 0),
    region([1, 0.2], 0),
    region([1, 1.1], 0),
    region([0, 0.9], 0),
    region([2, 1.0], 0),
  ];
  expect(order(items, "word").map((reg) => reg.center)).toEqual([
    [0, 0],
    [1, 0.2],
    [2, 0.1],
    [0, 0.9],
    [1, 1.1],
    [2, 1.0],
  ]);
});

test("focal spiral starts at the most colorful region", () => {
  const items = grid(3, 3, 1, 1);
  expect(order(items, "focal-spiral")[0].center).toEqual([1, 1]);
});

test("focal spiral visits in non-decreasing distance from the focal point", () => {
  const result = order(grid(5, 5, 2, 2), "focal-spiral");
  const focal = result[0].center;
  const radii = result.map((reg) =>
    Math.hypot(reg.center[0] - focal[0], reg.center[1] - focal[1]),
  );
  // a tight spiral should never jump far outward and then back inward; allow a
  // one-spacing tolerance for the rotational component
  for (let i = 1; i < radii.length; ++i) {
    expect(radii[i]).toBeGreaterThanOrEqual(radii[i - 1] - 1.0001);
  }
});

test("order returns a permutation of all regions", () => {
  const items = grid(4, 3, 2, 1);
  for (const method of ["word", "focal-spiral"] as const) {
    const result = order(items, method);
    expect(result.length).toBe(items.length);
    expect(sortedCenters(result)).toEqual(sortedCenters(items));
  }
});

test("a single region is returned as-is for every method", () => {
  const solo = region([3, 4], 0);
  for (const method of [
    "word",
    "focal-spiral",
  ] as const satisfies OrderMethod[]) {
    expect(order([solo], method)).toEqual([solo]);
  }
});
