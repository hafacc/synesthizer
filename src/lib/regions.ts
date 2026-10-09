/** extract ordered regions from an image to turn into notes */

import { type HSLC, type RGB, rgb2hslc } from "./colors";
import { shaped } from "./shapes";
import { ArrayVariance } from "./utils";

export type RegionMethod = "grid" | "bisect" | "shape";

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

/**
 * colors around a region: its bounding box grown `scale` times about its
 * center, sampled every `stride` pixels
 */
export function* surroundings(
  img: ImageData,
  poly: readonly (readonly [number, number])[],
  scale: number = 3,
  stride: number = 2,
): Generator<RGB> {
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const grow = (low: number, high: number, limit: number): [number, number] => {
    const reach = ((high - low) * scale) / 2;
    const middle = (low + high) / 2;
    return [
      Math.max(0, Math.floor(middle - reach)),
      Math.min(limit, Math.ceil(middle + reach)),
    ];
  };
  const [left, right] = grow(Math.min(...xs), Math.max(...xs), img.width);
  const [top, bottom] = grow(Math.min(...ys), Math.max(...ys), img.height);
  for (let row = top; row < bottom; row += stride) {
    for (let column = left; column < right; column += stride) {
      const index = (row * img.width + column) * 4;
      // @ts-expect-error slice to array
      yield rgba2rgb(img.data.slice(index, index + 4));
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

interface Leaf {
  left: number;
  top: number;
  right: number;
  bottom: number;
  // summed squared distance of the leaf's colors from their mean
  error: number;
  // the straight cut that lowers the error most, if the leaf can be cut
  cut: { vertical: boolean; at: number; gain: number } | null;
}

/**
 * Rectangles from repeatedly cutting the picture where it helps most.
 *
 * Starting from the whole picture, the rectangle whose best straight cut
 * removes the most color variation is cut in two, until there are `notes`
 * rectangles. Busy areas end up with many small rectangles and flat areas
 * with a few large ones. Variation is the summed squared distance of colors
 * from their rectangle's mean in the HSL cone, and a cut must fall in the
 * middle half of its side so no sliver is produced.
 */
export function* bisected(img: ImageData, notes: number): Generator<Region> {
  const { width, height } = img;
  // summed-area tables give any rectangle's sums in four lookups
  const stride = width + 1;
  const sums = [0, 1, 2].map(() => new Float64Array(stride * (height + 1)));
  const squares = new Float64Array(stride * (height + 1));
  let pixel = 0;
  for (const color of patch(img, 0, 0, width, height)) {
    const point = rgb2hslc(color);
    const below =
      (Math.floor(pixel / width) + 1) * stride + (pixel % width) + 1;
    let square = 0;
    sums.forEach((table, channel) => {
      table[below] =
        point[channel] +
        table[below - 1] +
        table[below - stride] -
        table[below - stride - 1];
      square += point[channel] * point[channel];
    });
    squares[below] =
      square +
      squares[below - 1] +
      squares[below - stride] -
      squares[below - stride - 1];
    pixel += 1;
  }
  const within = (
    table: Float64Array,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): number =>
    table[bottom * stride + right] -
    table[top * stride + right] -
    table[bottom * stride + left] +
    table[top * stride + left];
  const errorOf = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): number => {
    const count = (right - left) * (bottom - top);
    const mean = sums.reduce(
      (total, table) => total + within(table, left, top, right, bottom) ** 2,
      0,
    );
    return within(squares, left, top, right, bottom) - mean / count;
  };
  const leaf = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): Leaf => {
    const error = errorOf(left, top, right, bottom);
    let cut: Leaf["cut"] = null;
    // the longer side goes first so that ties, as in a flat area, halve it
    const wide = right - left >= bottom - top;
    for (const vertical of [wide, !wide]) {
      const [start, end] = vertical ? [left, right] : [top, bottom];
      const margin = Math.max(1, Math.ceil((end - start) / 4));
      const middle = Math.floor((start + end) / 2);
      // outward from the middle, so equal gains keep the most central cut
      for (let offset = 0; offset <= end - start; ++offset) {
        for (const at of offset === 0
          ? [middle]
          : [middle - offset, middle + offset]) {
          if (at - start >= margin && end - at >= margin) {
            const gain = vertical
              ? error -
                errorOf(left, top, at, bottom) -
                errorOf(at, top, right, bottom)
              : error -
                errorOf(left, top, right, at) -
                errorOf(left, at, right, bottom);
            if (cut === null || gain > cut.gain) {
              cut = { vertical, at, gain };
            }
          }
        }
      }
    }
    return { left, top, right, bottom, error, cut };
  };

  const target = Math.max(1, Math.min(Math.round(notes), width * height));
  const leaves = [leaf(0, 0, width, height)];
  while (leaves.length < target) {
    let best = -1;
    leaves.forEach((candidate, index) => {
      if (candidate.cut !== null) {
        const area = (candidate: Leaf): number =>
          (candidate.right - candidate.left) *
          (candidate.bottom - candidate.top);
        const chosen = leaves[best];
        if (
          chosen === undefined ||
          chosen.cut === null ||
          candidate.cut.gain > chosen.cut.gain ||
          (candidate.cut.gain === chosen.cut.gain &&
            area(candidate) > area(chosen))
        ) {
          best = index;
        }
      }
    });
    const chosen = leaves[best];
    if (chosen === undefined || chosen.cut === null) {
      break;
    }
    const { left, top, right, bottom } = chosen;
    const { vertical, at } = chosen.cut;
    leaves[best] = vertical
      ? leaf(left, top, at, bottom)
      : leaf(left, top, right, at);
    leaves.push(
      vertical ? leaf(at, top, right, bottom) : leaf(left, at, right, bottom),
    );
  }

  for (const { left, top, right, bottom, error } of leaves) {
    const num = (right - left) * (bottom - top);
    yield {
      colors: patch(img, left, top, right, bottom),
      num,
      poly: [
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
      ],
      center: [(left + right) / 2, (top + bottom) / 2],
      // rounding in the tables can leave a flat leaf a hair below zero
      variance: Math.max(0, error / num),
    };
  }
}

export function regions(
  img: ImageData,
  method: RegionMethod,
  noted: number,
): Generator<Region> {
  if (method === "grid") {
    return orderedGrid(img, noted);
  } else if (method === "bisect") {
    return bisected(img, noted);
  } else if (method === "shape") {
    return shaped(img, noted);
  } else {
    throw new Error(`unknown region method ${method}`);
  }
}
