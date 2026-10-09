import { expect, test } from "bun:test";
import type { Region } from "./regions";
import { shaped } from "./shapes";

function blank(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  return { width, height, data, colorSpace: "srgb" } as unknown as ImageData;
}

function painted(
  width: number,
  height: number,
  color: (column: number, row: number) => [number, number, number],
): ImageData {
  const img = blank(width, height);
  for (let pixel = 0; pixel < width * height; ++pixel) {
    const rgb = color(pixel % width, Math.floor(pixel / width));
    img.data.set([...rgb, 255], pixel * 4);
  }
  return img;
}

function halves(width: number, height: number): ImageData {
  // left half red, right half blue
  return painted(width, height, (column) =>
    column < width / 2 ? [255, 0, 0] : [0, 0, 255],
  );
}

function blobs(width: number, height: number): ImageData {
  // overlapping discs and a slanted band, so the best cuts are not square
  return painted(width, height, (column, row) => [
    Math.hypot(column - width / 3, row - height / 2) < height / 3 ? 220 : 30,
    column + 2 * row < width ? 200 : 40,
    Math.hypot(column - width, row) < height / 2 ? 240 : 10,
  ]);
}

function numbered(width: number, height: number): ImageData {
  // every pixel carries its own index as its color
  return painted(width, height, (column, row) => {
    const pixel = row * width + column;
    return [pixel >> 16, (pixel >> 8) & 255, pixel & 255];
  });
}

function signedArea(poly: [number, number][]): number {
  let area = 0;
  poly.forEach(([startX, startY], index) => {
    const [endX, endY] = poly[(index + 1) % poly.length];
    area += startX * endY - endX * startY;
  });
  return area / 2;
}

/** how far inside a convex polygon a point is; negative when outside */
function depth(poly: [number, number][], [x, y]: [number, number]): number {
  const turn = Math.sign(signedArea(poly));
  let least = Number.POSITIVE_INFINITY;
  poly.forEach(([startX, startY], index) => {
    const [endX, endY] = poly[(index + 1) % poly.length];
    const length = Math.hypot(endX - startX, endY - startY);
    const cross =
      (endX - startX) * (y - startY) - (endY - startY) * (x - startX);
    least = Math.min(least, (turn * cross) / length);
  });
  return least;
}

function snapshot(regions: Region[]): unknown[] {
  return regions.map(({ colors, ...rest }) => ({
    ...rest,
    colors: [...colors],
  }));
}

test("shaped yields exactly the count asked for and covers the picture", () => {
  for (const img of [blobs(64, 48), halves(64, 48), blank(64, 48)]) {
    for (const count of [1, 2, 7, 40, 225]) {
      const regions = [...shaped(img, count)];
      expect(regions.length).toBe(count);
      expect(regions.reduce((sum, { num }) => sum + num, 0)).toBe(64 * 48);
      for (const { num, colors } of regions) {
        expect(num).toBeGreaterThan(0);
        expect([...colors].length).toBe(num);
      }
    }
  }
});

test("shaped clamps the count to between one and the pixel count", () => {
  expect([...shaped(blank(2, 2), 40)].length).toBe(4);
  expect([...shaped(blobs(9, 7), 1000)].length).toBe(63);
  expect([...shaped(blobs(9, 7), 0)].length).toBe(1);
  expect([...shaped(blank(1, 1), 3)].length).toBe(1);
  expect([...shaped(blank(4, 400), 10)].length).toBe(10);
});

test("shaped polygons are convex, hold their center and tile the picture", () => {
  for (const count of [2, 7, 40, 225]) {
    const regions = [...shaped(blobs(64, 48), count)];
    let covered = 0;
    for (const { poly, center } of regions) {
      const area = Math.abs(signedArea(poly));
      expect(area).toBeGreaterThan(0);
      covered += area;
      expect(depth(poly, center)).toBeGreaterThan(0);
      // every corner turns the same way and none is worse than a straight line
      const turn = Math.sign(signedArea(poly));
      poly.forEach(([cornerX, cornerY], index) => {
        const [lastX, lastY] = poly[(index + poly.length - 1) % poly.length];
        const [nextX, nextY] = poly[(index + 1) % poly.length];
        const cross =
          (cornerX - lastX) * (nextY - cornerY) -
          (cornerY - lastY) * (nextX - cornerX);
        expect(turn * cross).toBeGreaterThan(-1e-6);
      });
    }
    expect(covered).toBeCloseTo(64 * 48, 6);
  }
});

test("shaped puts each pixel in exactly the region whose polygon holds it", () => {
  const width = 64;
  const height = 48;
  // cut on one picture, then read membership back through numbered colors
  const img = blobs(width, height);
  for (const count of [7, 40, 225]) {
    const regions = [...shaped(img, count)];
    const lookup = numbered(width, height);
    const original = img.data.slice();
    img.data.set(lookup.data);
    const seen = new Set<number>();
    for (const { poly, colors } of regions) {
      for (const [high, middle, low] of colors) {
        const pixel = (high << 16) | (middle << 8) | low;
        expect(seen.has(pixel)).toBe(false);
        seen.add(pixel);
        const point: [number, number] = [
          (pixel % width) + 0.5,
          Math.floor(pixel / width) + 0.5,
        ];
        expect(depth(poly, point)).toBeGreaterThan(-1e-6);
      }
    }
    expect(seen.size).toBe(width * height);
    img.data.set(original);
  }
});

test("shaped cuts where the colors change", () => {
  const [left, right] = [...shaped(halves(40, 20), 2)].sort(
    (first, second) => first.center[0] - second.center[0],
  );
  expect(left.num).toBe(400);
  expect(right.num).toBe(400);
  expect(Math.max(...left.poly.map(([x]) => x))).toBeCloseTo(20);
  expect(Math.min(...right.poly.map(([x]) => x))).toBeCloseTo(20);
  expect(left.variance).toBeCloseTo(0);
  expect(right.variance).toBeCloseTo(0);
});

test("shaped follows a slanted edge that a rectangle cannot", () => {
  const slanted = painted(48, 48, (column, row) =>
    column + row < 47 ? [255, 0, 0] : [0, 0, 255],
  );
  const regions = [...shaped(slanted, 2)];
  for (const { poly, variance } of regions) {
    const slants = poly.filter(([startX, startY], index) => {
      const [endX, endY] = poly[(index + 1) % poly.length];
      return Math.abs(endX - startX) > 1 && Math.abs(endY - startY) > 1;
    });
    expect(slants.length).toBe(1);
    expect(variance).toBeLessThan(0.05);
  }
});

test("shaped halves a flat picture squarely", () => {
  const regions = [...shaped(blank(40, 20), 4)];
  for (const { num, poly } of regions) {
    expect(num).toBe(200);
    expect(poly.length).toBe(4);
  }
});

test("shaped is deterministic", () => {
  const img = blobs(64, 48);
  expect(snapshot([...shaped(img, 40)])).toEqual(
    snapshot([...shaped(img, 40)]),
  );
});
