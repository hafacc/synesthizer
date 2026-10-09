// TODO better in wasm?
// TODO stochastic kmeans, where we pick a random sample each iteration?
// TODO this doesn't seem to actually split when we want. We might consider
// trying to look at HSV or even median cust algos, but we'd still need a bic
// for median cut

let randnCache: number | null = null;
function randn(): number {
  if (randnCache === null) {
    const v = Math.sqrt(-2 * Math.log(Math.random()));
    const u = 2 * Math.PI * Math.random();
    randnCache = v * Math.sin(u);
    return v * Math.cos(u);
  } else {
    const res = randnCache;
    randnCache = null;
    return res;
  }
}

/** sample index proportional to weights */
function randc(weights: Float64Array): number {
  const total = weights.reduce((s, v) => s + v, 0);
  const val = Math.random() * total;
  let running = 0;
  for (const [i, v] of weights.entries()) {
    running += v;
    if (val < running) return i;
  }
  return weights.length - 1;
}

function getRow(data: Float64Array, ind: number, dim: number): Float64Array {
  return data.subarray(ind * dim, ind * dim + dim);
}

function dist(left: Float64Array, right: Float64Array): number {
  return left.reduce((s, v, i) => s + (v - right[i]) ** 2, 0);
}

function kmeansPlusPlus(
  data: Float64Array,
  dim: number,
  nclusters: number,
): Float64Array {
  const ndata = data.length / dim;
  const clusters = new Float64Array(nclusters * dim);
  const ind = Math.floor(Math.random() * ndata);
  const row = getRow(data, ind, dim);
  clusters.set(row);
  const dists = new Float64Array(ndata);
  dists.fill(Infinity);

  for (let i = 1; i < nclusters; ++i) {
    // update dists
    const last = getRow(clusters, i - 1, dim);
    for (let j = 0; j < ndata; ++j) {
      const newDist = dist(last, getRow(data, j, dim));
      dists[j] = Math.min(dists[j], newDist);
    }

    // sample proprtional to squared dist
    const ind = randc(dists);

    // assign
    getRow(clusters, i, dim).set(getRow(data, ind, dim));
  }
  return clusters;
}

function maxSplit(data: Float64Array, dim: number): Float64Array {
  const ndata = data.length / dim;
  const clusters = new Float64Array(2 * dim);
  let maxDist = 0;
  for (let i = 0; i < ndata; ++i) {
    const left = getRow(data, i, dim);
    for (let j = 0; j < i; ++j) {
      const right = getRow(data, j, dim);
      const d = dist(left, right);
      if (d > maxDist) {
        maxDist = d;
        clusters.set(left);
        clusters.set(right, dim);
      }
    }
  }
  return clusters;
}

function isCenter(
  clusters: Float64Array,
  row: Float64Array,
  dim: number,
): boolean {
  const nclusters = clusters.length / dim;
  for (let c = 0; c < nclusters; ++c) {
    if (dist(getRow(clusters, c, dim), row) === 0) return true;
  }
  return false;
}

/**
 * Perform kmeans
 *
 * modify clusters in place
 */
function kmeansNative(
  data: Float64Array,
  clusters: Float64Array,
  dim: number,
  maxIterations: number,
): Uint32Array {
  const ndata = data.length / dim;
  const nclusters = clusters.length / dim;
  const lastAssigns = new Uint32Array(ndata);
  lastAssigns.fill(nclusters); // invalid assignment
  const assigns = new Uint32Array(ndata);
  const counts = new Uint32Array(nclusters);

  for (let i = maxIterations; i; --i) {
    // compute new assignments
    for (let d = 0; d < ndata; ++d) {
      let minDist = Infinity;
      let minInd = nclusters;
      for (let c = 0; c < nclusters; ++c) {
        let sqDist = 0;
        for (let j = 0; j < dim; ++j) {
          const diff = data[d * dim + j] - clusters[c * dim + j];
          sqDist += diff * diff;
        }
        if (sqDist < minDist) {
          minDist = sqDist;
          minInd = c;
        }
      }
      assigns[d] = minInd;
    }

    // compute mean of assigns
    counts.fill(0);
    clusters.fill(0);
    for (let d = 0; d < ndata; ++d) {
      const c = assigns[d];
      const count = (counts[c] += 1);
      for (let j = 0; j < dim; ++j) {
        const cind = c * dim + j;
        clusters[cind] += (data[d * dim + j] - clusters[cind]) / count;
      }
    }

    // restart any clusters with no assigns
    let allAssigned = true;
    let start = 0;
    while ((start = counts.indexOf(0, start)) !== -1) {
      // TODO kmeans++ instead of just random
      const row = getRow(data, Math.floor(Math.random() * ndata), dim);
      // a point that is already a center would leave this cluster empty again,
      // forever when every point is the same
      if (!isCenter(clusters, row, dim)) {
        getRow(clusters, start, dim).set(row);
        allAssigned = false;
      }
      start++; // next cluster
    }

    // don't break if we had to restart any clusters
    if (allAssigned && assigns.every((v, i) => lastAssigns[i] === v)) break;
    lastAssigns.set(assigns);
  }
  return assigns;
}

/** mean of the squared diff between data and centroid across all dims */
function variance(
  data: Float64Array,
  clusters: Float64Array,
  assigns: Uint32Array,
  dim: number,
  dof: number = 0,
): number {
  let vari = 0;
  let count = -dof;
  for (const [i, a] of assigns.entries()) {
    const row = getRow(data, i, dim);
    const centroid = getRow(clusters, a, dim);
    for (let j = 0; j < dim; ++j) {
      count++;
      const sqDiff = (row[j] - centroid[j]) ** 2;
      if (count < 1) {
        vari += sqDiff;
      } else {
        vari += (sqDiff - vari) / count;
      }
    }
  }
  return vari;
}

function bic(
  data: Float64Array,
  clusters: Float64Array,
  assigns: Uint32Array,
  dim: number,
  minVariance: number,
): [number, number] {
  const ndata = data.length / dim;
  const nclusters = clusters.length / dim;

  // count data in each cluster
  const counts = new Uint32Array(nclusters);
  for (const v of assigns) counts[v] += 1;

  // compute log likelihood
  // ignore clusters with no data
  const entropy = counts.reduce((s, v) => (v > 0 ? s + v * Math.log(v) : s), 0);
  const vari = variance(data, clusters, assigns, dim);
  const bicVariance = Math.max(vari, minVariance);
  const likelihood = entropy - (data.length / 2) * Math.log(bicVariance);

  // compute BIC
  const k = nclusters * (dim + 1); // number of parameters
  const bic = likelihood - (k / 2) * Math.log(ndata);
  return [bic, vari];
}

export function xmeans(
  data: Float64Array,
  dim: number,
  {
    maxKmeansIters = 100,
    initClusters = 1,
    maxClusters,
    minVariance = 0,
    splitStyle = "kmeans++",
  }: {
    maxKmeansIters?: number;
    initClusters?: number;
    maxClusters?: number;
    minVariance?: number;
    splitStyle?: "xmeans" | "kmeans++" | "max";
  } = {},
): [Float64Array, Uint32Array] {
  const stopping = maxClusters === undefined ? undefined : maxClusters * dim;

  // initialize first clusters
  let clusters = kmeansPlusPlus(data, dim, initClusters);
  // initialize first clusters
  let assigns = kmeansNative(data, clusters, dim, maxKmeansIters);

  // set best clusters and bic
  let [bestBic] = bic(data, clusters, assigns, dim, minVariance);
  let bestClusters = clusters;
  let bestAssigns = assigns;
  let didSplit = true;

  // xmeans loop
  while (clusters.length !== stopping && didSplit) {
    // try to split split each cluster
    const newClusters = new Float64Array(clusters.length * 2);
    const nclusters = clusters.length / dim;
    let nc = 0;
    didSplit = false;
    for (let c = 0; c < nclusters; ++c) {
      const center = getRow(clusters, c, dim);
      // pull out subset of data assigned to cluster c
      const nsub = assigns.reduce((num, ind) => num + +(ind === c), 0);
      const sub = new Float64Array(nsub * dim);
      let si = 0;
      for (const [i, v] of assigns.entries()) {
        if (v === c) {
          getRow(sub, si++, dim).set(getRow(data, i, dim));
        }
      }

      const [bicKeep, vari] = bic(
        sub,
        center,
        new Uint32Array(nsub),
        dim,
        minVariance,
      );

      if (vari === 0) {
        // every point is the same, so there is nothing to split
        getRow(newClusters, nc++, dim).set(center);
        continue;
      }

      // now split
      let splits: Float64Array;
      if (splitStyle === "kmeans++") {
        // initialize with kmeans++
        splits = kmeansPlusPlus(sub, dim, 2);
      } else if (splitStyle === "xmeans") {
        // generate a random vector with the same variance as the cluster center
        // and add/subtract it from the center to get initial splits
        const stdev = Math.sqrt(vari);
        splits = new Float64Array(2 * dim);
        splits.set(center);
        splits.set(center, dim);
        for (let j = 0; j < dim; ++j) {
          const val = randn() * stdev;
          splits[j] += val;
          splits[j + dim] -= val;
        }
      } else if (splitStyle === "max") {
        // use the max split
        splits = maxSplit(sub, dim);
      } else {
        throw new Error(`Unknown split style: ${splitStyle}`);
      }
      const splitAssigns = kmeansNative(sub, splits, dim, maxKmeansIters);

      const [bicSplit] = bic(sub, splits, splitAssigns, dim, minVariance);
      if (bicSplit > bicKeep) {
        // keep the split
        getRow(newClusters, nc++, dim).set(getRow(splits, 0, dim));
        getRow(newClusters, nc++, dim).set(getRow(splits, 1, dim));
        didSplit = true;
      } else {
        // keep the original cluster
        getRow(newClusters, nc++, dim).set(getRow(clusters, c, dim));
      }
    }

    // if we split beyond max, downsample to max with resivoir sampling
    if (maxClusters !== undefined && nc > maxClusters) {
      for (let i = maxClusters; i < nc; ++i) {
        if (Math.random() * (i + 1) < maxClusters) {
          // replace this cluster
          const ind = Math.floor(Math.random() * maxClusters);
          // NOTE we copy the full rows, which has an extra dim cost when we
          // overwrite more than once, but that's probably rare
          getRow(newClusters, ind, dim).set(getRow(newClusters, i, dim));
        }
      }
      nc = maxClusters;
    }

    // update current clusters
    clusters = newClusters.subarray(0, nc * dim);

    // optimize the current clusters
    assigns = kmeansNative(data, clusters, dim, maxKmeansIters);

    // check the bic of this vs the best found and only update best cluster if found a higher bic
    const [bicNext] = bic(data, clusters, assigns, dim, minVariance);
    if (bicNext > bestBic) {
      bestBic = bicNext;
      bestClusters = clusters;
      bestAssigns = assigns;
    }
  }

  return [bestClusters, bestAssigns];
}
