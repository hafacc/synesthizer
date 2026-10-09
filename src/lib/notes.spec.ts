import { expect, test } from "bun:test";
import { flat2sharp, sharp2flat } from "./notes";

test("sharp2flat converts every sharp, including the G/A wrap", () => {
  expect(sharp2flat("A#")).toBe("Bb");
  expect(sharp2flat("C#")).toBe("Db");
  expect(sharp2flat("D#")).toBe("Eb");
  expect(sharp2flat("F#")).toBe("Gb");
  expect(sharp2flat("G#")).toBe("Ab");
});

test("flat2sharp converts every flat, including the A/G wrap", () => {
  expect(flat2sharp("Ab")).toBe("G#");
  expect(flat2sharp("Bb")).toBe("A#");
  expect(flat2sharp("Db")).toBe("C#");
  expect(flat2sharp("Eb")).toBe("D#");
  expect(flat2sharp("Gb")).toBe("F#");
});

test("the conversions round trip and preserve surrounding text", () => {
  for (const note of ["A#", "C#", "D#", "F#", "G#"]) {
    expect(flat2sharp(sharp2flat(`${note}4`))).toBe(`${note}4`);
  }
});
