/** pixel free-shape regions: small patches merged along color edges */

import { type RGB, rgb2hslc } from "./colors";
import type { Region } from "./regions";

// widest spacing in pixels of the patches the picture is first cut into
const STEP = 8;
// patches to start from per region asked for, when the picture is small
const OVERSAMPLE = 12;
// color distance that weighs as much as being one patch spacing away
const TIGHTNESS = 0.3;
// rounds of moving the patches toward their colors
const ROUNDS = 5;
// power of the merged region's perimeter² / area that scales a merge's cost:
// 0 follows color alone, higher trades color fit for rounder regions
const ROUNDNESS = 1;
// power of the merged region's bounding box area / area that scales a
// merge's cost too: higher keeps regions from sprawling or wrapping around
const SPRAWL = 2;
// a region below this share of the average region's size is merged first
const SPECK = 1 / 16;
// factor on the cost of a merge that would wrap around a third region
const ENCLOSING = 4;
// squared color distance added to every pair, so flat areas merge evenly
const FLOOR = 1e-6;
// squared color distance that one pixel side of border is worth: a border
// pixel changes sides when that shortens the border by more than it costs
const SMOOTHING = 0.02;
// passes over the picture that let border pixels change sides
const SWEEPS = 4;
// distance in pixels an outline may stray from the pixel edges it follows
const TOLERANCE = 1.5;
// share of the deepest point's clearance that a label spot must keep
const DEPTH = 0.9;

// the pixel right of the way ahead at a corner, per heading: right, down,
// left, up; the pixel left of the way ahead is the entry one heading back
const AHEAD: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [-1, -1],
  [0, -1],
];
const HEADINGS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

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

/** the patch of every pixel: compact groups of nearby, similar pixels */
function patched(
  features: Float64Array,
  width: number,
  height: number,
  step: number,
): Int32Array {
  const total = width * height;
  const columns = Math.max(1, Math.round(width / step));
  const rows = Math.max(1, Math.round(height / step));
  const reach = Math.ceil(Math.max(width / columns, height / rows));
  const nearness = (TIGHTNESS / reach) ** 2;
  // five numbers per patch: its middle, then its mean color
  const middles = new Float64Array(columns * rows * 5);
  for (let patch = 0; patch < columns * rows; ++patch) {
    const middleX = (((patch % columns) + 0.5) * width) / columns;
    const middleY = ((Math.floor(patch / columns) + 0.5) * height) / rows;
    const pixel = Math.floor(middleY) * width + Math.floor(middleX);
    middles.set(
      [middleX, middleY, ...features.subarray(pixel * 3, pixel * 3 + 3)],
      patch * 5,
    );
  }
  const labels = new Int32Array(total);
  const distances = new Float64Array(total);
  const sums = new Float64Array(columns * rows * 6);
  for (let round = 0; round < ROUNDS; ++round) {
    distances.fill(Number.POSITIVE_INFINITY);
    for (let patch = 0; patch < columns * rows; ++patch) {
      const from = patch * 5;
      const middleX = middles[from];
      const middleY = middles[from + 1];
      const first = middles[from + 2];
      const second = middles[from + 3];
      const third = middles[from + 4];
      const left = Math.max(0, Math.floor(middleX - reach));
      const right = Math.min(width, Math.ceil(middleX + reach));
      const top = Math.max(0, Math.floor(middleY - reach));
      const bottom = Math.min(height, Math.ceil(middleY + reach));
      for (let row = top; row < bottom; ++row) {
        const down = (row + 0.5 - middleY) ** 2;
        for (let column = left; column < right; ++column) {
          const pixel = row * width + column;
          const at = pixel * 3;
          const distance =
            (features[at] - first) ** 2 +
            (features[at + 1] - second) ** 2 +
            (features[at + 2] - third) ** 2 +
            nearness * ((column + 0.5 - middleX) ** 2 + down);
          if (distance < distances[pixel]) {
            distances[pixel] = distance;
            labels[pixel] = patch;
          }
        }
      }
    }
    sums.fill(0);
    for (let pixel = 0; pixel < total; ++pixel) {
      const into = labels[pixel] * 6;
      sums[into] += 1;
      sums[into + 1] += (pixel % width) + 0.5;
      sums[into + 2] += Math.floor(pixel / width) + 0.5;
      sums[into + 3] += features[pixel * 3];
      sums[into + 4] += features[pixel * 3 + 1];
      sums[into + 5] += features[pixel * 3 + 2];
    }
    for (let patch = 0; patch < columns * rows; ++patch) {
      const count = sums[patch * 6];
      if (count > 0) {
        for (let field = 0; field < 5; ++field) {
          middles[patch * 5 + field] = sums[patch * 6 + field + 1] / count;
        }
      }
    }
  }
  return labels;
}

/** renumber labels so that each is one 4-connected group; gives the count */
function connect(labels: Int32Array, width: number, height: number): number {
  const total = width * height;
  const groups = new Int32Array(total).fill(-1);
  const pending = new Int32Array(total);
  let count = 0;
  for (let seed = 0; seed < total; ++seed) {
    if (groups[seed] === -1) {
      const label = labels[seed];
      let waiting = 0;
      pending[waiting++] = seed;
      groups[seed] = count;
      while (waiting > 0) {
        const pixel = pending[--waiting];
        const column = pixel % width;
        const around = [
          column > 0 ? pixel - 1 : -1,
          column < width - 1 ? pixel + 1 : -1,
          pixel - width,
          pixel + width < total ? pixel + width : -1,
        ];
        for (const next of around) {
          if (next >= 0 && groups[next] === -1 && labels[next] === label) {
            groups[next] = count;
            pending[waiting++] = next;
          }
        }
      }
      count += 1;
    }
  }
  labels.set(groups);
  return count;
}

/** candidate merges, cheapest first, with the merges of specks before all */
class Queue {
  readonly firsts: number[] = [];
  readonly seconds: number[] = [];
  // the two regions' versions summed; a later change to either outdates it
  readonly stamps: number[] = [];
  readonly costs: number[] = [];
  readonly urgent: boolean[] = [];
  // already put back once for wrapping around a third region
  readonly deferred: boolean[] = [];
  private readonly heap: number[] = [];

  private before(left: number, right: number): boolean {
    if (this.urgent[left] !== this.urgent[right]) {
      return this.urgent[left];
    } else if (this.costs[left] !== this.costs[right]) {
      return this.costs[left] < this.costs[right];
    } else {
      return left < right;
    }
  }

  push(
    first: number,
    second: number,
    stamp: number,
    cost: number,
    urgent: boolean,
    deferred: boolean,
  ): void {
    const entry = this.costs.length;
    this.firsts.push(first);
    this.seconds.push(second);
    this.stamps.push(stamp);
    this.costs.push(cost);
    this.urgent.push(urgent);
    this.deferred.push(deferred);
    let slot = this.heap.length;
    this.heap.push(entry);
    while (slot > 0) {
      const above = (slot - 1) >> 1;
      if (this.before(entry, this.heap[above])) {
        this.heap[slot] = this.heap[above];
        slot = above;
      } else {
        break;
      }
    }
    this.heap[slot] = entry;
  }

  pop(): number | undefined {
    const [top] = this.heap;
    const moved = this.heap.pop();
    if (moved !== undefined && this.heap.length > 0) {
      let slot = 0;
      for (;;) {
        let below = slot * 2 + 1;
        if (
          below + 1 < this.heap.length &&
          this.before(this.heap[below + 1], this.heap[below])
        ) {
          below += 1;
        }
        if (below < this.heap.length && this.before(this.heap[below], moved)) {
          this.heap[slot] = this.heap[below];
          slot = below;
        } else {
          break;
        }
      }
      this.heap[slot] = moved;
    }
    return top;
  }
}

/** merge touching labels, cheapest pair first, until `target` are left */
function merge(
  features: Float64Array,
  labels: Int32Array,
  count: number,
  target: number,
  width: number,
  height: number,
): void {
  const total = width * height;
  const sizes = new Float64Array(count);
  const sums = new Float64Array(count * 3);
  const perimeters = new Float64Array(count);
  // pixel sides on the picture's frame; a region with none can be enclosed
  const frames = new Float64Array(count);
  // the length of border shared with each touching region
  const borders: Map<number, number>[] = Array.from(
    { length: count },
    () => new Map<number, number>(),
  );
  // four numbers per region: the left, top, right and bottom of its box
  const boxes = new Float64Array(count * 4);
  for (let label = 0; label < count; ++label) {
    boxes.set([width, height, 0, 0], label * 4);
  }
  const touch = (first: number, second: number): void => {
    borders[first].set(second, (borders[first].get(second) ?? 0) + 1);
    borders[second].set(first, (borders[second].get(first) ?? 0) + 1);
    perimeters[first] += 1;
    perimeters[second] += 1;
  };
  for (let pixel = 0; pixel < total; ++pixel) {
    const label = labels[pixel];
    const column = pixel % width;
    const row = Math.floor(pixel / width);
    sizes[label] += 1;
    sums[label * 3] += features[pixel * 3];
    sums[label * 3 + 1] += features[pixel * 3 + 1];
    sums[label * 3 + 2] += features[pixel * 3 + 2];
    const framed =
      (column === 0 ? 1 : 0) +
      (column === width - 1 ? 1 : 0) +
      (row === 0 ? 1 : 0) +
      (row === height - 1 ? 1 : 0);
    frames[label] += framed;
    perimeters[label] += framed;
    boxes[label * 4] = Math.min(boxes[label * 4], column);
    boxes[label * 4 + 1] = Math.min(boxes[label * 4 + 1], row);
    boxes[label * 4 + 2] = Math.max(boxes[label * 4 + 2], column + 1);
    boxes[label * 4 + 3] = Math.max(boxes[label * 4 + 3], row + 1);
    if (column < width - 1 && labels[pixel + 1] !== label) {
      touch(label, labels[pixel + 1]);
    }
    if (row < height - 1 && labels[pixel + width] !== label) {
      touch(label, labels[pixel + width]);
    }
  }

  const smallest = (total / target) * SPECK;
  const versions = new Int32Array(count);
  const absorbed = new Int32Array(count).fill(-1);
  const queue = new Queue();
  const offer = (first: number, second: number, shared: number): void => {
    const size = sizes[first] + sizes[second];
    let apart = FLOOR;
    for (let channel = 0; channel < 3; ++channel) {
      apart +=
        (sums[first * 3 + channel] / sizes[first] -
          sums[second * 3 + channel] / sizes[second]) **
        2;
    }
    const perimeter = perimeters[first] + perimeters[second] - 2 * shared;
    // 1 for a square, more for anything longer or more ragged
    const ragged = perimeter ** 2 / (16 * size);
    const box =
      (Math.max(boxes[first * 4 + 2], boxes[second * 4 + 2]) -
        Math.min(boxes[first * 4], boxes[second * 4])) *
      (Math.max(boxes[first * 4 + 3], boxes[second * 4 + 3]) -
        Math.min(boxes[first * 4 + 1], boxes[second * 4 + 1]));
    queue.push(
      first,
      second,
      versions[first] + versions[second],
      ((sizes[first] * sizes[second]) / size) *
        apart *
        ragged ** ROUNDNESS *
        (box / size) ** SPRAWL,
      Math.min(sizes[first], sizes[second]) < smallest,
      false,
    );
  };
  const encloses = (first: number, second: number): boolean => {
    for (const other of borders[first].keys()) {
      if (
        frames[other] === 0 &&
        borders[other].size === 2 &&
        borders[second].has(other)
      ) {
        return true;
      }
    }
    return false;
  };
  borders.forEach((touching, first) => {
    for (const [second, shared] of touching) {
      if (first < second) {
        offer(first, second, shared);
      }
    }
  });

  let remaining = count;
  while (remaining > target) {
    const entry = queue.pop();
    if (entry === undefined) {
      break;
    }
    const first = queue.firsts[entry];
    const second = queue.seconds[entry];
    if (
      absorbed[first] === -1 &&
      absorbed[second] === -1 &&
      versions[first] + versions[second] === queue.stamps[entry]
    ) {
      if (
        !queue.urgent[entry] &&
        !queue.deferred[entry] &&
        encloses(first, second)
      ) {
        queue.push(
          first,
          second,
          queue.stamps[entry],
          queue.costs[entry] * ENCLOSING,
          false,
          true,
        );
      } else {
        const [kept, gone] =
          borders[first].size >= borders[second].size
            ? [first, second]
            : [second, first];
        const shared = borders[kept].get(gone) ?? 0;
        sizes[kept] += sizes[gone];
        frames[kept] += frames[gone];
        perimeters[kept] += perimeters[gone] - 2 * shared;
        for (let channel = 0; channel < 3; ++channel) {
          sums[kept * 3 + channel] += sums[gone * 3 + channel];
        }
        for (let side = 0; side < 4; ++side) {
          boxes[kept * 4 + side] = (side < 2 ? Math.min : Math.max)(
            boxes[kept * 4 + side],
            boxes[gone * 4 + side],
          );
        }
        borders[kept].delete(gone);
        for (const [other, length] of borders[gone]) {
          if (other !== kept) {
            const joined = (borders[kept].get(other) ?? 0) + length;
            borders[kept].set(other, joined);
            borders[other].delete(gone);
            borders[other].set(kept, joined);
          }
        }
        borders[gone].clear();
        absorbed[gone] = kept;
        versions[kept] += 1;
        remaining -= 1;
        for (const [other, length] of borders[kept]) {
          offer(kept, other, length);
        }
      }
    }
  }

  const renumbered = new Int32Array(count).fill(-1);
  let next = 0;
  for (let pixel = 0; pixel < total; ++pixel) {
    let label = labels[pixel];
    while (absorbed[label] !== -1) {
      label = absorbed[label];
    }
    if (renumbered[label] === -1) {
      renumbered[label] = next++;
    }
    // shortens the walk for the rest of this pixel's first label
    if (labels[pixel] !== label) {
      absorbed[labels[pixel]] = label;
    }
    labels[pixel] = renumbered[label];
  }
}

/** move border pixels to the neighbor that shortens the border at low cost */
function smooth(
  features: Float64Array,
  labels: Int32Array,
  count: number,
  width: number,
  height: number,
): void {
  const total = width * height;
  const sizes = new Float64Array(count);
  const sums = new Float64Array(count * 3);
  for (let pixel = 0; pixel < total; ++pixel) {
    const label = labels[pixel];
    sizes[label] += 1;
    sums[label * 3] += features[pixel * 3];
    sums[label * 3 + 1] += features[pixel * 3 + 1];
    sums[label * 3 + 2] += features[pixel * 3 + 2];
  }
  // squared distance of a pixel's color from a region's mean
  const apart = (pixel: number, label: number): number =>
    (features[pixel * 3] - sums[label * 3] / sizes[label]) ** 2 +
    (features[pixel * 3 + 1] - sums[label * 3 + 1] / sizes[label]) ** 2 +
    (features[pixel * 3 + 2] - sums[label * 3 + 2] / sizes[label]) ** 2;
  const around = new Int32Array(8);
  for (let sweep = 0; sweep < SWEEPS; ++sweep) {
    let moved = 0;
    for (let index = 0; index < total; ++index) {
      // alternate directions so that borders do not drift one way
      const pixel = sweep % 2 === 0 ? index : total - 1 - index;
      const label = labels[pixel];
      const column = pixel % width;
      const row = Math.floor(pixel / width);
      const left = column > 0;
      const right = column < width - 1;
      const up = row > 0;
      const down = row < height - 1;
      // clockwise from above, so that neighbors in the list touch
      around[0] = up ? labels[pixel - width] : -1;
      around[2] = right ? labels[pixel + 1] : -1;
      around[4] = down ? labels[pixel + width] : -1;
      around[6] = left ? labels[pixel - 1] : -1;
      if (
        (around[0] !== label && around[0] !== -1) ||
        (around[2] !== label && around[2] !== -1) ||
        (around[4] !== label && around[4] !== -1) ||
        (around[6] !== label && around[6] !== -1)
      ) {
        around[1] = up && right ? labels[pixel - width + 1] : -1;
        around[3] = down && right ? labels[pixel + width + 1] : -1;
        around[5] = down && left ? labels[pixel + width - 1] : -1;
        around[7] = up && left ? labels[pixel - width - 1] : -1;
        // leaving must not split the region: its pixels beside this one
        // have to be joined to each other around it
        let runs = 0;
        for (let side = 0; side < 8; side += 2) {
          if (
            around[side] === label &&
            (around[(side + 7) % 8] !== label ||
              around[(side + 6) % 8] !== label)
          ) {
            runs += 1;
          }
        }
        if (runs === 1) {
          const own = (sizes[label] / (sizes[label] - 1)) * apart(pixel, label);
          let best = 0;
          let choice = -1;
          for (let side = 0; side < 8; side += 2) {
            const other = around[side];
            if (other !== label && other !== -1) {
              let border = 0;
              for (let near = 0; near < 8; ++near) {
                const weight = near % 2 === 0 ? 1 : Math.SQRT1_2;
                if (around[near] === label) {
                  border += weight;
                } else if (around[near] === other) {
                  border -= weight;
                }
              }
              const change =
                (sizes[other] / (sizes[other] + 1)) * apart(pixel, other) -
                own +
                SMOOTHING * border;
              if (change < best) {
                best = change;
                choice = other;
              }
            }
          }
          if (choice !== -1) {
            for (let channel = 0; channel < 3; ++channel) {
              sums[label * 3 + channel] -= features[pixel * 3 + channel];
              sums[choice * 3 + channel] += features[pixel * 3 + channel];
            }
            sizes[label] -= 1;
            sizes[choice] += 1;
            labels[pixel] = choice;
            moved += 1;
          }
        }
      }
    }
    if (moved === 0) {
      break;
    }
  }
}

/** how far each pixel is from the nearest pixel outside its region */
function clearances(
  labels: Int32Array,
  width: number,
  height: number,
): Float32Array {
  const total = width * height;
  const depths = new Float32Array(total);
  const reach = (
    pixel: number,
    column: number,
    row: number,
    acrossStep: number,
    downStep: number,
  ): number => {
    const across = column + acrossStep;
    const down = row + downStep;
    const step = acrossStep !== 0 && downStep !== 0 ? Math.SQRT2 : 1;
    if (across < 0 || across >= width || down < 0 || down >= height) {
      return step;
    } else {
      const other = down * width + across;
      return labels[other] === labels[pixel] ? depths[other] + step : step;
    }
  };
  for (let pixel = 0; pixel < total; ++pixel) {
    const column = pixel % width;
    const row = Math.floor(pixel / width);
    depths[pixel] = Math.min(
      reach(pixel, column, row, -1, 0),
      reach(pixel, column, row, -1, -1),
      reach(pixel, column, row, 0, -1),
      reach(pixel, column, row, 1, -1),
    );
  }
  for (let pixel = total - 1; pixel >= 0; --pixel) {
    const column = pixel % width;
    const row = Math.floor(pixel / width);
    depths[pixel] = Math.min(
      depths[pixel],
      reach(pixel, column, row, 1, 0),
      reach(pixel, column, row, 1, 1),
      reach(pixel, column, row, 0, 1),
      reach(pixel, column, row, -1, 1),
    );
  }
  return depths;
}

/** the points of a path worth keeping, its two ends always among them */
function thinned(path: number[], stride: number, tolerance: number): number[] {
  const kept = new Uint8Array(path.length);
  kept[0] = 1;
  kept[path.length - 1] = 1;
  const pending: [number, number][] = [[0, path.length - 1]];
  for (let span = pending.pop(); span !== undefined; span = pending.pop()) {
    const [from, to] = span;
    const fromX = path[from] % stride;
    const fromY = Math.floor(path[from] / stride);
    const alongX = (path[to] % stride) - fromX;
    const alongY = Math.floor(path[to] / stride) - fromY;
    const lengthSquared = alongX ** 2 + alongY ** 2;
    let worst = tolerance;
    let farthest = -1;
    for (let middle = from + 1; middle < to; ++middle) {
      const offsetX = (path[middle] % stride) - fromX;
      const offsetY = Math.floor(path[middle] / stride) - fromY;
      const along = offsetX * alongX + offsetY * alongY;
      const distance =
        along <= 0
          ? Math.hypot(offsetX, offsetY)
          : along >= lengthSquared
            ? Math.hypot(offsetX - alongX, offsetY - alongY)
            : Math.abs(offsetX * alongY - offsetY * alongX) /
              Math.sqrt(lengthSquared);
      if (distance > worst) {
        worst = distance;
        farthest = middle;
      }
    }
    if (farthest !== -1) {
      kept[farthest] = 1;
      pending.push([from, farthest], [farthest, to]);
    }
  }
  return path.filter((_, index) => kept[index] === 1);
}

/** the area inside a closed path of corners */
function areaWithin(path: number[], stride: number): number {
  let doubled = 0;
  path.forEach((start, index) => {
    const end = path[(index + 1) % path.length];
    doubled +=
      (start % stride) * Math.floor(end / stride) -
      (end % stride) * Math.floor(start / stride);
  });
  return Math.abs(doubled) / 2;
}

/** whether a point is inside a closed path of corners */
function holds(path: number[], stride: number, x: number, y: number): boolean {
  let inside = false;
  path.forEach((start, index) => {
    const end = path[(index + 1) % path.length];
    const startX = start % stride;
    const startY = Math.floor(start / stride);
    const endX = end % stride;
    const endY = Math.floor(end / stride);
    if (
      startY > y !== endY > y &&
      x < startX + ((y - startY) / (endY - startY)) * (endX - startX)
    ) {
      inside = !inside;
    }
  });
  return inside;
}

/**
 * Regions of any shape that follow the picture's color edges pixel by pixel.
 *
 * Where `shaped` can only cut straight, this grows regions from the pixels
 * up. The picture is first cut into small compact patches of similar color
 * (SLIC: k-means over position and color, started from a grid `STEP` pixels
 * apart, or finer when many regions are asked of a small picture), and each
 * 4-connected part of a patch becomes a starting region. Touching regions are
 * then merged, cheapest pair first, until `notes` are left.
 *
 * The cost of a merge is the color variation it adds (Ward's criterion: the
 * rise in summed squared distance of colors from their region's mean in the
 * HSL cone, as in `bisected`) times two measures of the merged region's
 * shape: how far it is from round (its perimeter² / area, to the power
 * `ROUNDNESS`) and how little of its bounding box it fills (to the power
 * `SPRAWL`). Regions therefore stay compact and somewhat convex unless a
 * color edge says otherwise; both powers at 0 would follow color alone, for
 * a few points more of the color variation explained and far more winding
 * shapes. Regions smaller than `SPECK` of the average are merged before
 * anything else, and a merge that would wrap two regions around a third is
 * put off by a factor of `ENCLOSING`. A region can still end up around
 * another, as a background does around a disc.
 *
 * Borders are then tidied one pixel at a time: a border pixel moves to the
 * neighboring region when the border gets shorter by more than the move
 * costs in color (`SMOOTHING`), and never when that would split its region.
 *
 * Every region is 4-connected, and `poly` is its outer edge only; a region
 * enclosed by it is left for the overlay to draw on top. Outlines run along
 * pixel edges and are then thinned to within `TOLERANCE` pixels
 * (Douglas-Peucker). Each stretch of border between two points where three
 * regions meet is thinned once, the same way for both neighbors, so their
 * outlines coincide along it. A region whose thinned outline would lose its
 * shape or its `center` keeps the exact pixel edges, as do the stretches it
 * shares. `center` is the middle of the pixel closest to the region's
 * centroid among those nearly as far from the region's edge as any (within
 * `DEPTH` of the deepest), so a label there has room even when the region is
 * not convex.
 *
 * The count is exact, from one region up to one per pixel, and the result
 * depends on nothing but the picture and the count.
 *
 * @example
 * ```ts
 * const regions = [...blobbed(img, 40)];
 * ```
 */
export function* blobbed(img: ImageData, notes: number): Generator<Region> {
  const { width, height } = img;
  const total = width * height;
  const target = Math.max(1, Math.min(Math.round(notes), total));
  const features = new Float64Array(total * 3);
  for (let pixel = 0; pixel < total; ++pixel) {
    features.set(rgb2hslc(pixelColor(img, pixel)), pixel * 3);
  }

  const step = Math.min(STEP, Math.sqrt(total / (OVERSAMPLE * target)));
  let labels =
    step < 2
      ? Int32Array.from({ length: total }, (_, index) => index)
      : patched(features, width, height, step);
  let count = step < 2 ? total : connect(labels, width, height);
  if (count < target) {
    labels = Int32Array.from({ length: total }, (_, index) => index);
    count = total;
  }
  merge(features, labels, count, target, width, height);
  smooth(features, labels, target, width, height);

  const depths = clearances(labels, width, height);
  // seven numbers per region: its size, summed position, summed color and
  // summed squared color
  const sums = new Float64Array(target * 7);
  const deepest = new Float64Array(target);
  const firsts = new Int32Array(target).fill(-1);
  for (let pixel = 0; pixel < total; ++pixel) {
    const label = labels[pixel];
    const into = label * 7;
    const at = pixel * 3;
    sums[into] += 1;
    sums[into + 1] += pixel % width;
    sums[into + 2] += Math.floor(pixel / width);
    sums[into + 3] += features[at];
    sums[into + 4] += features[at + 1];
    sums[into + 5] += features[at + 2];
    sums[into + 6] +=
      features[at] ** 2 + features[at + 1] ** 2 + features[at + 2] ** 2;
    deepest[label] = Math.max(deepest[label], depths[pixel]);
    if (firsts[label] === -1) {
      firsts[label] = pixel;
    }
  }
  const starts = new Int32Array(target + 1);
  for (let label = 0; label < target; ++label) {
    starts[label + 1] = starts[label] + sums[label * 7];
  }
  const members = new Int32Array(total);
  const filled = starts.slice(0, target);
  const spots = new Int32Array(target).fill(-1);
  const nearest = new Float64Array(target).fill(Number.POSITIVE_INFINITY);
  for (let pixel = 0; pixel < total; ++pixel) {
    const label = labels[pixel];
    members[filled[label]++] = pixel;
    if (depths[pixel] >= DEPTH * deepest[label]) {
      const size = sums[label * 7];
      const away =
        ((pixel % width) - sums[label * 7 + 1] / size) ** 2 +
        (Math.floor(pixel / width) - sums[label * 7 + 2] / size) ** 2;
      if (away < nearest[label]) {
        nearest[label] = away;
        spots[label] = pixel;
      }
    }
  }

  const stride = width + 1;
  const labelAt = (column: number, row: number): number =>
    column < 0 || column >= width || row < 0 || row >= height
      ? -1
      : labels[row * width + column];
  // a corner where outlines are cut: three regions or the frame meet there,
  // two regions cross, or it is a corner of the picture
  const meeting = (corner: number): boolean => {
    const column = corner % stride;
    const row = Math.floor(corner / stride);
    const above = labelAt(column - 1, row - 1);
    const aboveRight = labelAt(column, row - 1);
    const below = labelAt(column - 1, row);
    const belowRight = labelAt(column, row);
    return (
      new Set([above, aboveRight, below, belowRight]).size > 2 ||
      (above === belowRight && aboveRight === below && above !== below) ||
      ((column === 0 || column === width) && (row === 0 || row === height))
    );
  };
  // the corners around a region's outer edge, clockwise on screen, and the
  // region across each step
  const rings = Array.from({ length: target }, (_, label) => {
    const corners: number[] = [];
    const across: number[] = [];
    const startColumn = firsts[label] % width;
    const startRow = Math.floor(firsts[label] / width);
    let column = startColumn;
    let row = startRow;
    let heading = 0;
    do {
      corners.push(row * stride + column);
      const [leftColumn, leftRow] = AHEAD[(heading + 3) % 4];
      across.push(labelAt(column + leftColumn, row + leftRow));
      column += HEADINGS[heading][0];
      row += HEADINGS[heading][1];
      const [rightColumn, rightRow] = AHEAD[heading];
      const [aheadColumn, aheadRow] = AHEAD[(heading + 3) % 4];
      // diagonal pixels do not count as touching, so the tighter turn wins
      if (labelAt(column + rightColumn, row + rightRow) !== label) {
        heading = (heading + 1) % 4;
      } else if (labelAt(column + aheadColumn, row + aheadRow) === label) {
        heading = (heading + 3) % 4;
      }
    } while (column !== startColumn || row !== startRow || heading !== 0);
    const cuts = corners.flatMap((corner, index) =>
      meeting(corner) ? [index] : [],
    );
    return { corners, across, cuts };
  });
  const exact = new Uint8Array(target);
  const outline = (label: number): number[] => {
    const { corners, across, cuts } = rings[label];
    const kept: number[] = [];
    if (cuts.length === 0) {
      // nobody shares a closed loop, so it only has to be cut somewhere
      const [startCorner] = corners;
      let far = 0;
      let farthest = 0;
      corners.forEach((corner, index) => {
        const distance = Math.hypot(
          (corner % stride) - (startCorner % stride),
          Math.floor(corner / stride) - Math.floor(startCorner / stride),
        );
        if (distance > farthest) {
          farthest = distance;
          far = index;
        }
      });
      const tolerance = exact[label] === 1 ? 0 : TOLERANCE;
      kept.push(
        ...thinned(corners.slice(0, far + 1), stride, tolerance).slice(0, -1),
        ...thinned(
          [...corners.slice(far), startCorner],
          stride,
          tolerance,
        ).slice(0, -1),
      );
    } else {
      cuts.forEach((from, index) => {
        const to = cuts[(index + 1) % cuts.length];
        const path =
          to > from
            ? corners.slice(from, to + 1)
            : [...corners.slice(from), ...corners.slice(0, to + 1)];
        const other = across[from];
        const tolerance =
          exact[label] === 1 || (other >= 0 && exact[other] === 1)
            ? 0
            : TOLERANCE;
        // both neighbors thin a stretch from the same end, to the same result
        const last = path.length - 1;
        const forward =
          path[0] < path[last] ||
          (path[0] === path[last] && path[1] < path[last - 1]);
        if (forward) {
          kept.push(...thinned(path, stride, tolerance).slice(0, -1));
        } else {
          kept.push(
            ...thinned(path.reverse(), stride, tolerance)
              .reverse()
              .slice(0, -1),
          );
        }
      });
    }
    return kept;
  };
  let outlines = rings.map((_, label) => outline(label));
  outlines.forEach((kept, label) => {
    const within = areaWithin(rings[label].corners, stride);
    if (
      kept.length < 3 ||
      Math.abs(areaWithin(kept, stride) - within) > within / 4 ||
      !holds(
        kept,
        stride,
        (spots[label] % width) + 0.5,
        Math.floor(spots[label] / width) + 0.5,
      )
    ) {
      exact[label] = 1;
    }
  });
  if (exact.includes(1)) {
    outlines = rings.map((_, label) => outline(label));
  }

  for (let label = 0; label < target; ++label) {
    const from = label * 7;
    const size = sums[from];
    const mean =
      sums[from + 3] ** 2 + sums[from + 4] ** 2 + sums[from + 5] ** 2;
    yield {
      colors: pixelColors(
        img,
        members.subarray(starts[label], starts[label + 1]),
      ),
      num: size,
      poly: outlines[label].map((corner): [number, number] => [
        corner % stride,
        Math.floor(corner / stride),
      ]),
      center: [
        (spots[label] % width) + 0.5,
        Math.floor(spots[label] / width) + 0.5,
      ],
      // rounding in the sums can leave a flat region a hair below zero
      variance: Math.max(0, (sums[from + 6] - mean / size) / size),
    };
  }
}
