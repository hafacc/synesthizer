/** module for what two hands can play at once on a piano */

// widest stretch of one hand, in semitones: a ninth, like C up to the D past
// the next C
const reach = 14;
// notes one hand can hold down at once
const fingers = 5;
// middle C, where the staves divide when the hands allow it
const middleC = 60;

/** whether one hand can play these notes, given low to high */
function oneHand(midis: readonly number[]): boolean {
  return (
    midis.length <= fingers &&
    (midis.length === 0 || midis[midis.length - 1] - midis[0] <= reach)
  );
}

/**
 * where to split a chord between the hands, as the number of its notes the
 * left hand takes, or null if two hands can't play it
 *
 * `midis` go low to high. Of the splits that work, the one nearest middle C is
 * chosen, so notes below middle C go to the left hand whenever they can.
 */
export function handSplit(midis: readonly number[]): number | null {
  const below = midis.filter((midi) => midi < middleC).length;
  let best: number | null = null;
  for (let split = 0; split <= midis.length; ++split) {
    if (
      oneHand(midis.slice(0, split)) &&
      oneHand(midis.slice(split)) &&
      (best === null || Math.abs(split - below) < Math.abs(best - below))
    ) {
      best = split;
    }
  }
  return best;
}

/** whether two hands can play these notes at once, in any order */
export function playable(midis: Iterable<number>): boolean {
  const sorted = [...new Set(midis)].sort((low, high) => low - high);
  return handSplit(sorted) !== null;
}
