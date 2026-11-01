import { expect, test } from "bun:test";
import { handSplit, playable } from "./hands";

test("handSplit divides at middle C when both hands reach", () => {
  expect(handSplit([48, 55, 64, 67])).toBe(2);
  expect(handSplit([64, 67, 72])).toBe(0);
});

test("handSplit moves the division when a hand can't reach", () => {
  // C4 to E5 is too far for the right hand, so C4 joins the left
  expect(handSplit([48, 60, 76])).toBe(2);
  // D4 to G5 is too far for the right hand, so D4 joins the left
  expect(handSplit([55, 62, 67, 79])).toBe(2);
  expect(handSplit([36, 62, 79])).toBeNull();
});

test("playable rejects chords too wide or too full for two hands", () => {
  expect(playable([24, 60, 96])).toBe(false);
  expect(playable([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77])).toBe(false);
  expect(playable([24, 96])).toBe(true);
  expect(playable([60, 60, 72])).toBe(true);
});
