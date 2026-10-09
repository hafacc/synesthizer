/** free-shape regions: convex polygons from straight cuts at any angle */

import { type RGB, rgb2hslc } from "./colors";
import type { Region } from "./regions";

// cut directions tried, evenly spread over a half turn
const DIRECTIONS = 16;
// side of the pixel blocks that stand in for pixels when cutting a large piece
const BLOCK = 4;
// a piece with more pixels than this picks its direction from blocks
const DETAILED = 512;
// share of a piece's width that a cut must leave on each side
const MARGIN = 1 / 4;
// length over width beyond which a cut's gain is scaled down in proportion
const SLENDER = 4;
// nudge that keeps a pixel on a piece's edge out of the neighboring bin
const SLACK = 1e-7;
// gains closer than this per pixel count as equal
const TIE = 1e-9;

type Point = [number, number];

// the two axes come first so that equal gains, as in a flat area, cut squarely
const NORMALS: Point[] = [
  [1, 0],
  [0, 1],
  ...Array.from({ length: DIRECTIONS }, (_, index): Point => {
    const angle = (index * Math.PI) / DIRECTIONS;
    return [Math.cos(angle), Math.sin(angle)];
  }).filter((_, index) => index % (DIRECTIONS / 2) !== 0),
];

interface Samples {
  xs: Float64Array;
  ys: Float64Array;
  // four numbers per sample: its pixel count, then its three summed colors
  values: Float64Array;
}

interface Cut {
  normal: Point;
  // the cut is the line `steps` along the normal from the piece's near side
  low: number;
  steps: number;
  // color variation removed, scaled down when the cut leaves a slender piece
  gain: number;
}

interface Piece {
  poly: Point[];
  pixels: Int32Array;
  // the blocks whose middle is inside, kept only while the piece is large
  cells: Int32Array | null;
  // summed squared distance of the piece's colors from their mean
  error: number;
  cut: Cut | null;
}

// TODO share with regions.ts once it exports its alpha handling
function applyAlpha(channel: number, alpha: number): number {
  return Math.round(((channel - 255) * alpha) / 255) + 255;
}

function pixelColor(img: ImageData, pixel: number): RGB {
  const at = pixel * 4;
  const alpha = img.data[at + 3];
  return [
    applyAlpha(img.data[at], alpha),
    applyAlpha(img.data[at + 1], alpha),
    applyAlpha(img.data[at + 2], alpha),
  ];
}

function* pixelColors(img: ImageData, pixels: Int32Array): Generator<RGB> {
  for (const pixel of pixels) {
    yield pixelColor(img, pixel);
  }
}

function span(poly: Point[], [normalX, normalY]: Point): [number, number] {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const [x, y] of poly) {
    const along = normalX * x + normalY * y;
    low = Math.min(low, along);
    high = Math.max(high, along);
  }
  return [low, high];
}

/** the best cut of a piece across one direction, if any is allowed */
function scan(
  samples: Samples,
  members: Int32Array,
  poly: Point[],
  normal: Point,
  strict: boolean,
): Cut | null {
  const [normalX, normalY] = normal;
  const [low, high] = span(poly, normal);
  const extent = high - low;
  const [near, far] = span(poly, [-normalY, normalX]);
  const length = far - near;
  // spare bins so that rounding never folds the last samples into one
  const bins = Math.floor(extent) + 2;
  const sums = new Float64Array(bins * 4);
  const { xs, ys, values } = samples;
  for (let index = 0; index < members.length; ++index) {
    const member = members[index];
    const along = normalX * xs[member] + normalY * ys[member] - low + SLACK;
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(along))) * 4;
    const from = member * 4;
    sums[bin] += values[from];
    sums[bin + 1] += values[from + 1];
    sums[bin + 2] += values[from + 2];
    sums[bin + 3] += values[from + 3];
  }
  for (let index = 4; index < sums.length; ++index) {
    sums[index] += sums[index - 4];
  }
  const whole = sums.subarray(sums.length - 4);
  const [count] = whole;
  const base = (whole[1] ** 2 + whole[2] ** 2 + whole[3] ** 2) / count;
  const margin = strict ? Math.max(1, extent * MARGIN) : SLACK;
  const middle = Math.round(extent / 2);
  let best: Cut | null = null;
  // outward from the middle, so equal gains keep the most central cut
  for (let offset = 0; offset < bins; ++offset) {
    for (const steps of offset === 0
      ? [middle]
      : [middle - offset, middle + offset]) {
      if (steps >= margin && extent - steps >= margin) {
        const at = (steps - 1) * 4;
        const before = sums[at];
        const after = count - before;
        if (before > 0 && after > 0) {
          let apart = -base;
          for (let channel = 1; channel < 4; ++channel) {
            const sum = sums[at + channel];
            apart += sum ** 2 / before + (whole[channel] - sum) ** 2 / after;
          }
          const narrower = Math.min(steps, extent - steps);
          const gain = apart * Math.min(1, (SLENDER * narrower) / length);
          if (best === null || gain > best.gain + TIE * count) {
            best = { normal, low, steps, gain };
          }
        }
      }
    }
  }
  return best;
}

/** the best cut of a piece across every direction, if any is allowed */
function sweep(
  samples: Samples,
  members: Int32Array,
  poly: Point[],
  strict: boolean,
): Cut | null {
  const [across, down, ...oblique] = NORMALS;
  const [left, right] = span(poly, across);
  const [top, bottom] = span(poly, down);
  // the longer side goes first so that ties, as in a flat area, halve it
  const normals =
    right - left >= bottom - top
      ? [across, down, ...oblique]
      : [down, across, ...oblique];
  let best: Cut | null = null;
  for (const normal of normals) {
    const cut = scan(samples, members, poly, normal, strict);
    if (
      cut !== null &&
      (best === null || cut.gain > best.gain + TIE * members.length)
    ) {
      best = cut;
    }
  }
  return best;
}

/** the members on each side of a cut */
function divide(
  samples: Samples,
  members: Int32Array,
  { normal: [normalX, normalY], low, steps }: Cut,
): [Int32Array, Int32Array] {
  const { xs, ys } = samples;
  // must agree with the binning in `scan`
  const sides = new Uint8Array(members.length);
  let count = 0;
  for (let index = 0; index < members.length; ++index) {
    const member = members[index];
    if (normalX * xs[member] + normalY * ys[member] - low + SLACK < steps) {
      sides[index] = 1;
      count += 1;
    }
  }
  const before = new Int32Array(count);
  const after = new Int32Array(members.length - count);
  let beforeIndex = 0;
  let afterIndex = 0;
  for (let index = 0; index < members.length; ++index) {
    if (sides[index] === 1) {
      before[beforeIndex++] = members[index];
    } else {
      after[afterIndex++] = members[index];
    }
  }
  return [before, after];
}

/** the two convex polygons on each side of a cut, sharing its end points */
function split(
  poly: Point[],
  { normal: [normalX, normalY], low, steps }: Cut,
): [Point[], Point[]] {
  const at = low + steps;
  const before: Point[] = [];
  const after: Point[] = [];
  poly.forEach((start, index) => {
    const end = poly[(index + 1) % poly.length];
    const startSide = normalX * start[0] + normalY * start[1] - at;
    const endSide = normalX * end[0] + normalY * end[1] - at;
    if (startSide <= 0) {
      before.push(start);
    }
    if (startSide >= 0) {
      after.push(start);
    }
    if (startSide * endSide < 0) {
      const share = startSide / (startSide - endSide);
      const crossing: Point = [
        start[0] + (end[0] - start[0]) * share,
        start[1] + (end[1] - start[1]) * share,
      ];
      before.push(crossing);
      after.push(crossing);
    }
  });
  return [before, after];
}

function centroid(poly: Point[]): Point {
  let area = 0;
  let centerX = 0;
  let centerY = 0;
  poly.forEach(([startX, startY], index) => {
    const [endX, endY] = poly[(index + 1) % poly.length];
    const cross = startX * endY - endX * startY;
    area += cross;
    centerX += (startX + endX) * cross;
    centerY += (startY + endY) * cross;
  });
  return [centerX / (3 * area), centerY / (3 * area)];
}

/**
 * Convex polygons from repeatedly cutting the picture where it helps most.
 *
 * This is `bisected` with cuts at any of sixteen angles instead of two.
 * Starting from the whole picture, the piece whose best straight cut removes
 * the most color variation is cut in two, until there are `notes` pieces.
 * Variation is the summed squared distance of colors from their piece's mean
 * in the HSL cone, as in `bisected`.
 *
 * A straight cut of a convex polygon leaves two convex polygons, so every
 * region is one convex polygon with its `center` inside, and the two sides of
 * a cut share its end points, so neighbors meet without gaps. A pixel belongs
 * to the piece whose polygon holds its middle, which is decided by the same
 * line that cuts the polygon, so `colors` and `poly` always agree.
 *
 * Two rules keep the pieces from getting thin: a cut must fall in the middle
 * half of the piece's width across the cut, as in `bisected`, and the gain of
 * a cut that leaves a piece more than four times longer than wide is scaled
 * down by how far it goes over. A piece too small for the first rule is cut
 * anywhere that separates its pixels, so the count is exact up to one region
 * per pixel.
 *
 * To stay fast, a large piece chooses its direction from 4-pixel blocks and
 * then places the cut in that direction using every pixel.
 *
 * @example
 * ```ts
 * const regions = [...shaped(img, 40)];
 * ```
 */
export function* shaped(img: ImageData, notes: number): Generator<Region> {
  const { width, height } = img;
  const total = width * height;
  const pixels: Samples = {
    xs: new Float64Array(total),
    ys: new Float64Array(total),
    values: new Float64Array(total * 4),
  };
  const columns = Math.ceil(width / BLOCK);
  const rows = Math.ceil(height / BLOCK);
  const blocks: Samples = {
    xs: new Float64Array(columns * rows),
    ys: new Float64Array(columns * rows),
    values: new Float64Array(columns * rows * 4),
  };
  const squares = new Float64Array(total);
  for (let pixel = 0; pixel < total; ++pixel) {
    const column = pixel % width;
    const row = Math.floor(pixel / width);
    const point = rgb2hslc(pixelColor(img, pixel));
    const block =
      Math.floor(row / BLOCK) * columns + Math.floor(column / BLOCK);
    pixels.xs[pixel] = column + 0.5;
    pixels.ys[pixel] = row + 0.5;
    blocks.xs[block] += column + 0.5;
    blocks.ys[block] += row + 0.5;
    for (let channel = 0; channel < 4; ++channel) {
      const value = channel === 0 ? 1 : point[channel - 1];
      pixels.values[pixel * 4 + channel] = value;
      blocks.values[block * 4 + channel] += value;
    }
    squares[pixel] = point[0] ** 2 + point[1] ** 2 + point[2] ** 2;
  }
  for (let block = 0; block < columns * rows; ++block) {
    blocks.xs[block] /= blocks.values[block * 4];
    blocks.ys[block] /= blocks.values[block * 4];
  }

  const piece = (
    poly: Point[],
    members: Int32Array,
    cells: Int32Array | null,
  ): Piece => {
    const sums = [0, 0, 0];
    let square = 0;
    for (let index = 0; index < members.length; ++index) {
      const from = members[index] * 4;
      sums[0] += pixels.values[from + 1];
      sums[1] += pixels.values[from + 2];
      sums[2] += pixels.values[from + 3];
      square += squares[members[index]];
    }
    const mean = sums.reduce((sum, value) => sum + value * value, 0);
    const error = square - mean / members.length;
    const kept = members.length > DETAILED ? cells : null;
    let cut: Cut | null = null;
    if (kept !== null) {
      const rough = sweep(blocks, kept, poly, true);
      if (rough !== null) {
        cut = scan(pixels, members, poly, rough.normal, true);
      }
    }
    if (cut === null && members.length > 1) {
      cut =
        sweep(pixels, members, poly, true) ??
        sweep(pixels, members, poly, false);
    }
    return { poly, pixels: members, cells: kept, error, cut };
  };

  const target = Math.max(1, Math.min(Math.round(notes), total));
  const pieces = [
    piece(
      [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ],
      Int32Array.from({ length: total }, (_, index) => index),
      Int32Array.from({ length: columns * rows }, (_, index) => index),
    ),
  ];
  while (pieces.length < target) {
    let best = -1;
    pieces.forEach((candidate, index) => {
      if (candidate.cut !== null) {
        const chosen = pieces[best];
        const tie =
          TIE * Math.max(candidate.pixels.length, chosen?.pixels.length ?? 0);
        if (
          chosen === undefined ||
          chosen.cut === null ||
          candidate.cut.gain > chosen.cut.gain + tie ||
          (candidate.cut.gain >= chosen.cut.gain - tie &&
            candidate.pixels.length > chosen.pixels.length)
        ) {
          best = index;
        }
      }
    });
    const chosen = pieces[best];
    if (chosen === undefined || chosen.cut === null) {
      break;
    }
    const [polyBefore, polyAfter] = split(chosen.poly, chosen.cut);
    const [before, after] = divide(pixels, chosen.pixels, chosen.cut);
    const [cellsBefore, cellsAfter] =
      chosen.cells === null
        ? [null, null]
        : divide(blocks, chosen.cells, chosen.cut);
    pieces[best] = piece(polyBefore, before, cellsBefore);
    pieces.push(piece(polyAfter, after, cellsAfter));
  }

  for (const { poly, pixels: members, error } of pieces) {
    yield {
      colors: pixelColors(img, members),
      num: members.length,
      poly,
      center: centroid(poly),
      // rounding in the sums can leave a flat piece a hair below zero
      variance: Math.max(0, error / members.length),
    };
  }
}
