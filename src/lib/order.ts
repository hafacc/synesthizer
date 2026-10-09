/** order regions for playback, independent of how they were carved */

import type { Region } from "./regions";

export type OrderMethod = "word" | "focal-spiral";

/**
 * median nearest-neighbor distance among centers
 *
 * this is the natural length scale of a region layout, used to set the row
 * tolerance for word order and the spiral tightness for focal spiral. it is
 * only meaningful with at least two points.
 */
function medianSpacing(centers: [number, number][]): number {
  const count = centers.length;
  if (count < 2) {
    throw new Error("median spacing needs at least two centers");
  }
  const nearest: number[] = [];
  for (let i = 0; i < count; ++i) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < count; ++j) {
      if (i === j) {
        continue;
      }
      const dx = centers[i][0] - centers[j][0];
      const dy = centers[i][1] - centers[j][1];
      const dist = Math.hypot(dx, dy);
      if (dist < best) {
        best = dist;
      }
    }
    nearest.push(best);
  }
  nearest.sort((left, right) => left - right);
  const mid = Math.floor(nearest.length / 2);
  if (nearest.length % 2 === 0) {
    return (nearest[mid - 1] + nearest[mid]) / 2;
  } else {
    return nearest[mid];
  }
}

/**
 * reading order: top-to-bottom, left-to-right
 *
 * a plain lexicographic sort on floating-point centers would zig-zag whenever
 * two regions in the same visual row differ slightly in y, so we group centers
 * into rows by approximate y (within half the median spacing) and sort each row
 * by x.
 */
function wordOrder(regions: Region[]): Region[] {
  const centers = regions.map((region) => region.center);
  const rowTolerance = medianSpacing(centers) / 2;
  const byHeight = regions.map((_, index) => index);
  byHeight.sort((left, right) => centers[left][1] - centers[right][1]);

  const ordered: Region[] = [];
  let row: number[] = [];
  let rowTop = Number.NEGATIVE_INFINITY;
  const flush = () => {
    row.sort((left, right) => centers[left][0] - centers[right][0]);
    for (const index of row) {
      ordered.push(regions[index]);
    }
    row = [];
  };
  for (const index of byHeight) {
    if (row.length > 0 && centers[index][1] - rowTop >= rowTolerance) {
      flush();
    }
    if (row.length === 0) {
      rowTop = centers[index][1];
    }
    row.push(index);
  }
  flush();
  return ordered;
}

/**
 * focal spiral: start at the most colorful region and spiral outward
 *
 * we model an Archimedean spiral r = a·θ centered on the most colorful region
 * (the one with the largest color variance), with the arm spacing a·2π set to
 * the median region spacing so successive turns sit about one region apart. each
 * region is placed at the spiral position it most nearly lies on: at polar
 * offset (radius, angle) the spiral passes through radius at total angles
 * angle + 2π·k, so we pick the turn k whose radius best matches and sort
 * ascending by that total angle. the focal region (radius 0) sorts first;
 * everything else falls onto progressively outer turns.
 */
function focalSpiralOrder(regions: Region[]): Region[] {
  let focal = 0;
  for (let i = 1; i < regions.length; ++i) {
    if (regions[i].variance > regions[focal].variance) {
      focal = i;
    }
  }
  const [focalX, focalY] = regions[focal].center;
  const centers = regions.map((region) => region.center);
  // arm spacing a·2π ≈ region spacing, so a = spacing / 2π (clamped off zero)
  const armScale = Math.max(medianSpacing(centers), 1e-9) / (2 * Math.PI);
  const turn = 2 * Math.PI;

  const score = regions.map((region) => {
    const dx = region.center[0] - focalX;
    const dy = region.center[1] - focalY;
    const radius = Math.hypot(dx, dy);
    let angle = Math.atan2(dy, dx);
    if (angle < 0) {
      angle += turn;
    }
    const turns = Math.max(0, Math.round((radius / armScale - angle) / turn));
    return angle + turn * turns;
  });

  const indices = regions.map((_, index) => index);
  indices.sort((left, right) => score[left] - score[right]);
  return indices.map((index) => regions[index]);
}

/** reorder regions into the playback order for the given method */
export function order(regions: Region[], method: OrderMethod): Region[] {
  // a single region (or none) has only one ordering, and the spacing-based
  // heuristics are undefined there
  if (regions.length < 2) {
    return [...regions];
  }
  if (method === "word") {
    return wordOrder(regions);
  } else if (method === "focal-spiral") {
    return focalSpiralOrder(regions);
  } else {
    throw new Error(`unknown order method ${method}`);
  }
}
