/** extract ordered regions from an image to turn into notes */

import { type HSLC, type RGB, rgb2hslc } from "./colors";
import { ArrayVariance } from "./utils";

export type RegionMethod = "grid";

export interface Region {
  colors: Iterable<RGB>;
  num: number;
  poly: [number, number][];
  center: [number, number];
  // total spread of the region's colors in the HSL cone; 0 when empty
  variance: number;
}

// TODO custom ordering
// TODO voronoi regions
// TODO regions based off of segment anything

// TODO alternate transparent color instead of white?
function applyAlpha(c: number, alpha: number): number {
  return Math.round(((c - 255) * alpha) / 255) + 255;
}

function rgba2rgb(rgba: readonly [number, number, number, number]): RGB {
  const [ri, gi, bi, a] = rgba;
  return [ri, gi, bi].map((c) => applyAlpha(c, a)) as [number, number, number];
}

function* patch(
  img: ImageData,
  xMin: number,
  yMin: number,
  xMax: number,
  yMax: number,
): Generator<RGB> {
  for (let j = yMin; j < yMax; ++j) {
    for (let i = xMin; i < xMax; ++i) {
      const ind = (j * img.width + i) * 4;
      // @ts-expect-error slice to array
      yield rgba2rgb(img.data.slice(ind, ind + 4));
    }
  }
}

function colorVariance(colors: Iterable<RGB>): number {
  const spread = new ArrayVariance<HSLC>();
  for (const color of colors) {
    spread.push(rgb2hslc(color));
  }
  return spread.total ?? 0;
}

/** a single region */
export function* single(img: ImageData): Generator<Region> {
  const colors = patch(img, 0, 0, img.width, img.height);
  const num = img.width * img.height;
  const poly: [number, number][] = [
    [0, 0],
    [img.width, 0],
    [img.width, img.height],
    [0, img.height],
  ];
  const center: [number, number] = [img.width / 2, img.height / 2];
  const variance = colorVariance(patch(img, 0, 0, img.width, img.height));
  yield { colors, num, poly, center, variance };
}

/** integer boundaries that split `size` pixels into `count` near-equal runs */
function edges(size: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) =>
    Math.round((index * size) / count),
  );
}

/** an ordered set of apprximately square patches */
export function* orderedGrid(img: ImageData, notes: number): Generator<Region> {
  const scale = Math.sqrt(notes / (img.width * img.height));
  // clamp to [1, size]: at most one region per pixel, never zero regions
  const nwidth = Math.min(
    img.width,
    Math.max(1, Math.round(img.width * scale)),
  );
  const nheight = Math.min(
    img.height,
    Math.max(1, Math.round(img.height * scale)),
  );
  const columns = edges(img.width, nwidth);
  const rows = edges(img.height, nheight);

  for (let row = 0; row < nheight; ++row) {
    for (let column = 0; column < nwidth; ++column) {
      const imin = columns[column];
      const jmin = rows[row];
      const imax = columns[column + 1];
      const jmax = rows[row + 1];

      const colors = patch(img, imin, jmin, imax, jmax);
      const num = (imax - imin) * (jmax - jmin);
      const poly: [number, number][] = [
        [imin, jmin],
        [imax, jmin],
        [imax, jmax],
        [imin, jmax],
      ];
      const center: [number, number] = [
        imin + (imax - imin) / 2,
        jmin + (jmax - jmin) / 2,
      ];
      const variance = colorVariance(patch(img, imin, jmin, imax, jmax));

      yield { colors, num, poly, center, variance };
    }
  }
}

export function regions(
  img: ImageData,
  method: RegionMethod,
  noted: number,
): Generator<Region> {
  if (method === "grid") {
    return orderedGrid(img, noted);
  } else {
    throw new Error(`unknown region method ${method}`);
  }
}
