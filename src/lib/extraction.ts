/** module for extracting colors from a patch */

import { type HSLC, hslc2rgb, type RGB, rgb2hslc } from "./colors";
import { xmeans } from "./kmeans";
import { ArrayMean } from "./utils";

export type ColorChoice = "mean" | "xmeans" | "proportional";

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

export function* hslcXmeans(
  colors: Iterable<RGB>,
  num: number,
  maxClusters: number,
  minStd: number,
): Generator<[RGB, number]> {
  const data = new Float64Array(num * 3);
  let i = 0;
  for (const color of colors) {
    const [x, y, z] = rgb2hslc(color);
    data[i++] = x;
    data[i++] = y;
    data[i++] = z;
  }
  const [clusters, assigns] = xmeans(data, 3, {
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
      counts[i],
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
  mode: ColorChoice,
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
