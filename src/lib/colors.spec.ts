import { expect, test } from "bun:test";
import { hsl2rgb, hslc2rgb, rgb2hsl, rgb2hslc } from "./colors";

test("hsl2rgb transitivity", () => {
  const white = [255, 255, 255] as const;
  expect(hsl2rgb(rgb2hsl(white))).toEqual(white);

  const black = [0, 0, 0] as const;
  expect(hsl2rgb(rgb2hsl(black))).toEqual(black);

  const red = [250, 0, 10] as const;
  expect(hsl2rgb(rgb2hsl(red))).toEqual(red);
});

test("hslc round trip recovers the original color", () => {
  for (let r = 0; r <= 255; r += 51) {
    for (let g = 0; g <= 255; g += 51) {
      for (let b = 0; b <= 255; b += 51) {
        const rgb = [r, g, b] as const;
        const back = hslc2rgb(rgb2hslc(rgb));
        for (let channel = 0; channel < 3; ++channel) {
          expect(Math.abs(back[channel] - rgb[channel])).toBeLessThanOrEqual(1);
        }
      }
    }
  }
});
