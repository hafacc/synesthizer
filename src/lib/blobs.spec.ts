import { expect, test } from "bun:test";
import { blobbed } from "./blobs";
import type { Region } from "./regions";

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

function inDisc(column: number, row: number): boolean {
  return Math.hypot(column + 0.5 - 30, row + 0.5 - 22) < 13;
}

function disc(): ImageData {
  // a yellow disc that touches no side of a blue 64 by 48 picture
  return painted(64, 48, (column, row) =>
    inDisc(column, row) ? [240, 220, 0] : [0, 40, 200],
  );
}

function blobs(width: number, height: number): ImageData {
  // overlapping discs and a slanted band, with a ripple so nothing is flat
  return painted(width, height, (column, row) => [
    (Math.hypot(column - width / 3, row - height / 2) < height / 3 ? 220 : 30) +
      ((column * 7 + row * 3) % 5),
    (column + 2 * row < width ? 200 : 40) + ((column * 3 + row * 11) % 7),
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

/** the region of every pixel, read back through numbered colors */
function membership(img: ImageData, regions: Region[]): Int32Array {
  const { width, height } = img;
  const original = img.data.slice();
  img.data.set(numbered(width, height).data);
  const owners = new Int32Array(width * height).fill(-1);
  regions.forEach(({ colors }, index) => {
    for (const [high, middle, low] of colors) {
      const pixel = (high << 16) | (middle << 8) | low;
      expect(owners[pixel]).toBe(-1);
      owners[pixel] = index;
    }
  });
  img.data.set(original);
  return owners;
}

/** how many 4-connected groups the pixels of each region form */
function groups(owners: Int32Array, width: number, count: number): number[] {
  const found = Array.from({ length: count }, () => 0);
  const seen = new Uint8Array(owners.length);
  owners.forEach((owner, seed) => {
    if (seen[seed] === 0) {
      found[owner] += 1;
      seen[seed] = 1;
      const pending = [seed];
      for (
        let pixel = pending.pop();
        pixel !== undefined;
        pixel = pending.pop()
      ) {
        const column = pixel % width;
        const around = [
          column > 0 ? pixel - 1 : -1,
          column < width - 1 ? pixel + 1 : -1,
          pixel - width,
          pixel + width,
        ];
        for (const next of around) {
          if (owners[next] === owner && seen[next] === 0) {
            seen[next] = 1;
            pending.push(next);
          }
        }
      }
    }
  });
  return found;
}

function area(poly: [number, number][]): number {
  let doubled = 0;
  poly.forEach(([startX, startY], index) => {
    const [endX, endY] = poly[(index + 1) % poly.length];
    doubled += startX * endY - endX * startY;
  });
  return Math.abs(doubled) / 2;
}

function holds(poly: [number, number][], [x, y]: [number, number]): boolean {
  let inside = false;
  poly.forEach(([startX, startY], index) => {
    const [endX, endY] = poly[(index + 1) % poly.length];
    if (
      startY > y !== endY > y &&
      x < startX + ((y - startY) / (endY - startY)) * (endX - startX)
    ) {
      inside = !inside;
    }
  });
  return inside;
}

function snapshot(regions: Region[]): unknown[] {
  return regions.map(({ colors, ...rest }) => ({
    ...rest,
    colors: [...colors],
  }));
}

test("blobbed yields exactly the count asked for and covers the picture", () => {
  for (const img of [blobs(64, 48), halves(64, 48), blank(64, 48), disc()]) {
    for (const count of [1, 2, 7, 40, 225]) {
      const regions = [...blobbed(img, count)];
      expect(regions.length).toBe(count);
      expect(regions.reduce((sum, { num }) => sum + num, 0)).toBe(64 * 48);
      for (const { num, colors } of regions) {
        expect(num).toBeGreaterThan(0);
        expect([...colors].length).toBe(num);
      }
    }
  }
});

test("blobbed clamps the count to between one and the pixel count", () => {
  expect([...blobbed(blank(2, 2), 40)].length).toBe(4);
  expect([...blobbed(blobs(9, 7), 1000)].length).toBe(63);
  expect([...blobbed(blobs(9, 7), 0)].length).toBe(1);
  expect([...blobbed(blank(1, 1), 3)].length).toBe(1);
  expect([...blobbed(blank(4, 400), 10)].length).toBe(10);
});

test("blobbed puts every pixel in exactly one 4-connected region", () => {
  for (const img of [blobs(64, 48), blobs(150, 110), blank(64, 48), disc()]) {
    for (const count of [1, 2, 7, 40, 225]) {
      const regions = [...blobbed(img, count)];
      const owners = membership(img, regions);
      expect(owners.includes(-1)).toBe(false);
      expect(groups(owners, img.width, count)).toEqual(
        regions.map((): number => 1),
      );
    }
  }
});

test("blobbed polygons have area, stay close to their pixels and hold their center", () => {
  for (const img of [blobs(64, 48), blobs(150, 110), blank(64, 48), disc()]) {
    const { width, height } = img;
    for (const count of [1, 2, 7, 40, 225]) {
      const regions = [...blobbed(img, count)];
      const owners = membership(img, regions);
      regions.forEach(({ poly, center, num }, index) => {
        expect(poly.length).toBeGreaterThanOrEqual(3);
        // the outline goes around the region and anything it encloses
        expect(area(poly)).toBeGreaterThan(num / 2);
        for (const [x, y] of poly) {
          expect(Number.isInteger(x) && x >= 0 && x <= width).toBe(true);
          expect(Number.isInteger(y) && y >= 0 && y <= height).toBe(true);
        }
        const [centerX, centerY] = center;
        expect(holds(poly, center)).toBe(true);
        expect(owners[Math.floor(centerY) * width + Math.floor(centerX)]).toBe(
          index,
        );
      });
      // a pixel more than two pixels from any other region is in its polygon
      owners.forEach((owner, pixel) => {
        const column = pixel % width;
        const row = Math.floor(pixel / width);
        let deep = true;
        for (let down = -2; down <= 2; ++down) {
          for (let across = -2; across <= 2; ++across) {
            const nearColumn = column + across;
            const nearRow = row + down;
            if (
              nearColumn >= 0 &&
              nearColumn < width &&
              nearRow >= 0 &&
              nearRow < height &&
              owners[nearRow * width + nearColumn] !== owner
            ) {
              deep = false;
            }
          }
        }
        if (deep) {
          expect(holds(regions[owner].poly, [column + 0.5, row + 0.5])).toBe(
            true,
          );
        }
      });
    }
  }
});

test("blobbed neighbors share the corners of the border between them", () => {
  for (const count of [7, 40]) {
    const regions = [...blobbed(blobs(150, 110), count)];
    const users = new Map<string, number>();
    for (const { poly } of regions) {
      for (const [x, y] of poly) {
        users.set(`${x},${y}`, (users.get(`${x},${y}`) ?? 0) + 1);
      }
    }
    // only a corner on the picture's frame can belong to a single outline,
    // unless one region lies wholly inside another
    for (const [corner, count] of users) {
      const [x, y] = corner.split(",").map(Number);
      if (x > 0 && x < 150 && y > 0 && y < 110) {
        expect(count).toBeGreaterThanOrEqual(2);
      }
    }
  }
});

test("blobbed splits where the colors change", () => {
  const [left, right] = [...blobbed(halves(40, 20), 2)].sort(
    (first, second) => first.center[0] - second.center[0],
  );
  expect(left.num).toBe(400);
  expect(right.num).toBe(400);
  expect(Math.max(...left.poly.map(([x]) => x))).toBe(20);
  expect(Math.min(...right.poly.map(([x]) => x))).toBe(20);
  expect(left.variance).toBeCloseTo(0);
  expect(right.variance).toBeCloseTo(0);
});

test("blobbed follows a curved edge: a disc is one region", () => {
  const img = disc();
  let inside = 0;
  for (let pixel = 0; pixel < 64 * 48; ++pixel) {
    inside += inDisc(pixel % 64, Math.floor(pixel / 64)) ? 1 : 0;
  }
  const [small, large] = [...blobbed(img, 2)].sort(
    (first, second) => first.num - second.num,
  );
  expect(small.num).toBe(inside);
  expect(large.num).toBe(64 * 48 - inside);
  expect(small.variance).toBeCloseTo(0);
  expect(large.variance).toBeCloseTo(0);
  // the disc's outline is round, within the slack of thinning it
  for (const [x, y] of small.poly) {
    expect(Math.abs(Math.hypot(x - 30, y - 22) - 13)).toBeLessThan(2);
  }
  expect(Math.abs(area(small.poly) - inside)).toBeLessThan(inside / 10);
  expect(inDisc(Math.floor(small.center[0]), Math.floor(small.center[1]))).toBe(
    true,
  );
  // the background's outline is the picture's frame, without the hole
  expect(area(large.poly)).toBe(64 * 48);
  expect(large.poly.length).toBe(4);
  expect(inDisc(Math.floor(large.center[0]), Math.floor(large.center[1]))).toBe(
    false,
  );
});

test("blobbed keeps a concave region's center inside it", () => {
  // a red letter C on blue: its centroid falls in the gap
  const letter = (column: number, row: number): boolean =>
    column >= 8 &&
    column < 40 &&
    row >= 8 &&
    row < 40 &&
    !(column >= 16 && row >= 16 && row < 32);
  const img = painted(48, 48, (column, row) =>
    letter(column, row) ? [255, 0, 0] : [0, 0, 255],
  );
  const [small] = [...blobbed(img, 2)].sort(
    (first, second) => first.num - second.num,
  );
  expect(small.variance).toBeCloseTo(0);
  expect(letter(Math.floor(small.center[0]), Math.floor(small.center[1]))).toBe(
    true,
  );
  expect(holds(small.poly, small.center)).toBe(true);
});

test("blobbed divides a flat picture into compact regions", () => {
  const regions = [...blobbed(blank(40, 20), 4)];
  expect(regions.length).toBe(4);
  for (const { num, poly, variance } of regions) {
    expect(num).toBeGreaterThan(100);
    expect(area(poly)).toBeGreaterThan(100);
    expect(variance).toBe(0);
  }
});

test("blobbed gives each pixel of a tiny picture its own square", () => {
  const regions = [...blobbed(blank(2, 2), 4)];
  expect(regions.map(({ center }) => center)).toEqual([
    [0.5, 0.5],
    [1.5, 0.5],
    [0.5, 1.5],
    [1.5, 1.5],
  ]);
  for (const { num, poly } of regions) {
    expect(num).toBe(1);
    expect(poly.length).toBe(4);
    expect(area(poly)).toBe(1);
  }
  const [whole] = [...blobbed(blank(1, 1), 1)];
  expect(whole.poly.length).toBe(4);
  expect(whole.center).toEqual([0.5, 0.5]);
});

test("blobbed is deterministic", () => {
  const img = blobs(64, 48);
  expect(snapshot([...blobbed(img, 40)])).toEqual(
    snapshot([...blobbed(img, 40)]),
  );
});
