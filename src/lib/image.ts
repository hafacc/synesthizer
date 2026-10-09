/** This file has utilities for turning an image into notes. */
import type { Chord, Message, Result } from "./worker-interface";

/**
 * Convert an image into playable chords via a background worker.
 *
 * Aborting `signal` stops the worker and rejects with the signal's reason.
 */
export async function convert(
  img: ImageData,
  options: Omit<Message, "img">,
  signal?: AbortSignal,
): Promise<Chord[]> {
  signal?.throwIfAborted();
  const message: Message = { img, ...options };
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  let res: Result;
  try {
    res = await new Promise<Result>((resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
      worker.addEventListener("message", (event: MessageEvent<Result>) => {
        resolve(event.data);
      });
      // a load/parse failure or bad message clone posts no message; reject so
      // we don't hang forever
      worker.addEventListener("error", (event) => {
        reject(new Error(event.message || "worker failed to load"));
      });
      worker.addEventListener("messageerror", () => {
        reject(new Error("worker message could not be deserialized"));
      });
      worker.postMessage(message);
    });
  } finally {
    worker.terminate();
  }
  if (res.typ === "err") {
    throw new Error(res.err);
  } else {
    return res.chords;
  }
}
