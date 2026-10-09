/** module for working with colors */
export type RGB = readonly [number, number, number] & {
  readonly __tag?: unique symbol;
};
export type HSL = readonly [number, number, number] & {
  readonly __tag?: unique symbol;
};
export type HSLC = readonly [number, number, number] & {
  readonly __tag?: unique symbol;
};

export function rgb2hsl(rgb: RGB): HSL {
  const maxval = Math.max(...rgb);
  const minval = Math.min(...rgb);
  const chroma = maxval - minval;
  const [r, g, b] = rgb;
  const hue =
    chroma === 0
      ? 0
      : maxval === r
        ? ((g - b) / chroma + 6) % 6
        : maxval === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4;
  const lightness = (minval + chroma / 2) / 255;
  const saturation =
    lightness === 0 || lightness === 1
      ? 0
      : chroma / 255 / (1 - Math.abs(2 * lightness - 1));
  return [hue * 60, saturation, lightness];
}

/** convert rgb to the hsl cone */
export function rgb2hslc(rgb: RGB): HSLC {
  const maxval = Math.max(...rgb);
  const minval = Math.min(...rgb);
  const chroma = maxval - minval;
  const [r, g, b] = rgb;
  const hue =
    chroma === 0
      ? 0
      : maxval === r
        ? (g - b) / chroma
        : maxval === g
          ? (b - r) / chroma + 2
          : (r - g) / chroma + 4;
  const lightness = (minval + chroma / 2) / 255;
  const scale = chroma / 255 / 2;
  const x = Math.cos((hue * Math.PI) / 3) * scale;
  const y = Math.sin((hue * Math.PI) / 3) * scale;
  return [x, y, lightness - 0.5];
}

/** convery from hsl to rgb */
export function hsl2rgb(hsl: HSL): RGB {
  const [h, s, l] = hsl;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let res: RGB;
  if (h < 60) {
    res = [c + m, x + m, m];
  } else if (h < 120) {
    res = [x + m, c + m, m];
  } else if (h < 180) {
    res = [m, c + m, x + m];
  } else if (h < 240) {
    res = [m, x + m, c + m];
  } else if (h < 300) {
    res = [x + m, m, c + m];
  } else {
    res = [c + m, m, x + m];
  }
  return res.map((v) => Math.round(v * 255)) as unknown as RGB;
}

/** convery from hsl to rgb */
export function hslc2rgb(hsl: HSLC): RGB {
  const [x, y, z] = hsl;
  const l = z + 0.5;
  const h = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
  const hp = (h * 3) / Math.PI;
  const c = Math.sqrt(x * x + y * y) * 2;
  const ex = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  let res: RGB;
  if (hp < 1) {
    res = [c + m, ex + m, m];
  } else if (hp < 2) {
    res = [ex + m, c + m, m];
  } else if (hp < 3) {
    res = [m, c + m, ex + m];
  } else if (hp < 4) {
    res = [m, ex + m, c + m];
  } else if (hp < 5) {
    res = [ex + m, m, c + m];
  } else {
    res = [c + m, m, ex + m];
  }
  return res.map((v) => Math.round(v * 255)) as unknown as RGB;
}

/** convert from rgb to a hex string */
export function rgb2hex(rgb: RGB): string {
  const base = rgb
    .map((n) => Math.round(n).toString(16).padStart(2, "0"))
    .join("");
  return `#${base}`;
}

/** convert from rgb to a hex string */
export function hex2rgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
