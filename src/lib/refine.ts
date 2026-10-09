/** module for refining a "song" of weighted notes into what we want to play */

import "core-js/actual/iterator";

export type RefineMethod = "trim";

/** trim notes that are too infrequent or when there's too many */
export function* trim(
  weighted: [string, number][][],
  minWeight: number,
  maxNotes: number,
): Generator<string[]> {
  for (const notes of weighted) {
    const filtered = notes.filter(([, w]) => w >= minWeight);
    filtered.sort(([, a], [, b]) => b - a);
    yield [
      ...Iterator.from(filtered)
        .take(maxNotes)
        .map(([n]) => n),
    ];
  }
}

export function refine(
  weighted: [string, number][][],
  method: RefineMethod,
  { minWeight, maxNotes }: { minWeight: number; maxNotes: number },
): Generator<string[]> {
  if (method === "trim") {
    return trim(weighted, minWeight, maxNotes);
  } else {
    throw new Error(`unknown refine method ${method}`);
  }
}
