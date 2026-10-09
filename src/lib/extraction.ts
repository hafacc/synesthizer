/** module for extracting colors from a patch */

import { type HSLC, hslc2rgb, type RGB, rgb2hslc } from "./colors";
import { xmeans } from "./kmeans";
import { ArrayMean } from "./utils";

export type ColorChoice = "mean" | "xmeans" | "proportional" | "new";

export function* rgbMean(colors: Iterable<RGB>): Generator<[RGB, number]> {
  const mean = new ArrayMean<RGB>();
  for (const color of colors) {
    mean.push(color);
  }
  yield [mean.mean, 1];
}

export function* hslcMean(colors: Iterable<RGB>): Generator<[RGB, number]> {
  const mean = new ArrayMean<HSLC>();
  for (const color of colors) {
    mean.push(rgb2hslc(color));
  }
  yield [hslc2rgb(mean.mean), 1];
}

// most pixels of a region that x-means clusters; larger regions are sampled
// evenly, which finds the same colors in a fraction of the time
const maxClustered = 1024;

export function* hslcXmeans(
  colors: Iterable<RGB>,
  num: number,
  maxClusters: number,
  minStd: number,
): Generator<[RGB, number]> {
  const stride = Math.max(1, Math.ceil(num / maxClustered));
  const data = new Float64Array(Math.ceil(num / stride) * 3);
  let seen = 0;
  let filled = 0;
  for (const color of colors) {
    if (seen++ % stride === 0) {
      const [x, y, z] = rgb2hslc(color);
      data[filled++] = x;
      data[filled++] = y;
      data[filled++] = z;
    }
  }
  const [clusters, assigns] = xmeans(data.subarray(0, filled), 3, {
    maxClusters,
    minVariance: minStd * minStd,
  });
  const numClusters = clusters.length / 3;
  const counts = new Uint32Array(numClusters);
  for (const ind of assigns) {
    counts[ind] += 1;
  }
  for (let i = 0; i < numClusters; ++i) {
    yield [
      hslc2rgb([...clusters.subarray(i * 3, i * 3 + 3)] as unknown as HSLC),
      counts[i] * stride,
    ];
  }
}

export function* proportional(colors: Iterable<RGB>): Generator<[RGB, number]> {
  for (const color of colors) {
    yield [color, 1];
  }
}

export function extract(
  colors: Iterable<RGB>,
  mode: Exclude<ColorChoice, "new">,
  { num, maxNotes, minStd }: { num: number; maxNotes: number; minStd: number },
): Generator<[RGB, number]> {
  if (mode === "mean") {
    return rgbMean(colors);
  } else if (mode === "xmeans") {
    return hslcXmeans(colors, num, maxNotes, minStd);
  } else if (mode === "proportional") {
    return proportional(colors);
  } else {
    throw new Error(`invalid color selection mode: ${mode}`);
  }
}
