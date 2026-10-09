import type { ColorChoice } from "./extraction";
import type { NoteConversion } from "./notes";
import type { OrderMethod } from "./order";
import type { RefineMethod } from "./refine";
import type { RegionMethod } from "./regions";

export interface Chord {
  id: string; // unique id
  // sequence of notes and octave like "Ab4"
  notes: string[];
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
