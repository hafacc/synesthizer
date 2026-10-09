import type { ColorChoice } from "./extraction";
import type { FitOptions } from "./fit";
import type { NoteConversion } from "./notes";
import type { OrderMethod } from "./order";
import type { RefineMethod } from "./refine";
import type { RegionMethod } from "./regions";

export type NoteLength = "even" | "area";

export interface Chord {
  id: string; // unique id
  // sequence of notes and octave like "Ab4"
  notes: string[];
  // quieter notes that sound along with them
  soft: string[];
  // how hard the notes are struck, from 0 to 1
  velocity: number;
  // name of the key the chord was fitted to, like "Ab minor"
  key: string | null;
  // duration in ms
  duration: number;
  // color for rendering
  color: string;
  // location of this chord on the image
  poly: [number, number][];
  // the center of the polygon
  center: [number, number];
}

export interface Message {
  img: ImageData;
  bpm: number;
  duration: number;
  region: RegionMethod;
  order: OrderMethod;
  colorChoice: ColorChoice;
  minStd: number;
  noteMethod: NoteConversion;
  refineMethod: RefineMethod;
  minWeight: number;
  maxNotes: number;
  // share of a chord's votes that come from the colors around its region
  surround: number;
  noteLength: NoteLength;
  // whether a chord's missing triad notes are added quietly
  fill: boolean;
  fit: FitOptions;
}

interface Err {
  readonly typ: "err";
  readonly err: string;
}

interface Success {
  readonly typ: "success";
  readonly chords: Chord[];
}

export type Result = Err | Success;
