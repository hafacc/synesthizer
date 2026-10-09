/** module for rendering a song to an audio file */

import {
  AudioBufferSource,
  BufferTarget,
  canEncodeAudio,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WavOutputFormat,
} from "mediabunny";
import { loaded, Offline, Sampler } from "tone";
import { fade, sampleUrls } from "./samples";
import { strikes } from "./score";
import type { Chord } from "./worker-interface";

// seconds the last chord is left to ring
const tail = 3;
// the samples are recorded at this rate, so a higher one only adds size
const sampleRate = 44100;

/** a rendered song and the file extension its format goes by */
export interface Rendered {
  file: Blob;
  extension: "m4a" | "wav";
}

/**
 * Render a song as it plays, with or without held notes, to an audio file.
 *
 * The file is AAC in an MP4 container (.m4a) when the browser can encode
 * that, which Chrome and Safari can, and an uncompressed WAV otherwise.
 */
export async function renderAudio(
  song: readonly Chord[],
  hold: boolean,
): Promise<Rendered> {
  const struck = strikes(song, hold);
  const length =
    song.reduce((total, { duration }) => total + duration, 0) / 1000 + tail;
  const buffer = await Offline(
    async () => {
      const sampler = new Sampler({
        urls: sampleUrls(),
        release: fade,
      }).toDestination();
      await loaded();
      for (const { note, start, length: held, velocity } of struck) {
        sampler.triggerAttackRelease(note, held, start, velocity);
      }
    },
    length,
    2,
    sampleRate,
  );
  const audio = buffer.get();
  if (audio === undefined) {
    throw new Error("the song rendered to nothing");
  }

  const compressed = await canEncodeAudio("aac", {
    numberOfChannels: 2,
    sampleRate,
  });
  const output = new Output({
    format: compressed ? new Mp4OutputFormat() : new WavOutputFormat(),
    target: new BufferTarget(),
  });
  const source = compressed
    ? new AudioBufferSource({ codec: "aac", bitrate: QUALITY_HIGH })
    : new AudioBufferSource({ codec: "pcm-s16" });
  output.addAudioTrack(source);
  await output.start();
  await source.add(audio);
  await output.finalize();
  const bytes = output.target.buffer;
  if (bytes === null) {
    throw new Error("the audio file came out empty");
  } else {
    return compressed
      ? { file: new Blob([bytes], { type: "audio/mp4" }), extension: "m4a" }
      : { file: new Blob([bytes], { type: "audio/wav" }), extension: "wav" };
  }
}
