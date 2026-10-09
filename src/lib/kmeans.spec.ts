import { expect, test } from "bun:test";
import { xmeans } from "./kmeans";

test("xmeans keeps identical points as one cluster", () => {
  // identical points previously spun through every kmeans iteration
  const data = new Float64Array(3000).fill(0.5);
  const [clusters, assigns] = xmeans(data, 3, { maxClusters: 4 });
  expect([...clusters]).toEqual([0.5, 0.5, 0.5]);
  expect(new Set(assigns).size).toBe(1);
});

test("xmeans separates two well-separated clusters", () => {
  // 50 points around the origin and 50 around (100, 100)
  const points: number[] = [];
  for (let i = 0; i < 50; ++i) {
    const t = i / 50;
    points.push(t, t);
  }
  for (let i = 0; i < 50; ++i) {
    const t = i / 50;
    points.push(100 + t, 100 + t);
  }
  const data = new Float64Array(points);

  const [clusters, assigns] = xmeans(data, 2, {
    initClusters: 2,
    maxClusters: 2,
  });
  expect(clusters.length).toBe(4); // two 2-D centroids

  const centroids = [
    [clusters[0], clusters[1]],
    [clusters[2], clusters[3]],
  ];
  // one centroid lands near each true cluster mean
  expect(centroids.some((c) => Math.hypot(c[0], c[1]) < 10)).toBe(true);
  expect(centroids.some((c) => Math.hypot(c[0] - 100, c[1] - 100) < 10)).toBe(
    true,
  );

  // the two clusters end up in different partitions
  expect(new Set(assigns).size).toBe(2);
});
