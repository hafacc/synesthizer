<script lang="ts">
  import { onMount } from "svelte";
  import { Sampler } from "tone";
  import { asset } from "$app/paths";
  import { orderedNotes } from "../notes";
  import type { Chord } from "../worker-interface";

  let {
    song,
    playing = $bindable(),
    ready = $bindable(),
    onerror,
  }: {
    song: Chord[] | null;
    playing: number | null;
    ready: boolean;
    onerror: (message: string) => void;
  } = $props();

  const octaves = [1, 2, 3, 4, 5, 6, 7] as const;

  let sampler = $state.raw<Sampler | null>(null);
  // index of the chord sounding now, and when it was due to start
  let current: number | null = null;
  let due = 0;

  // mounting only happens in the browser, so the audio sampler is never
  // constructed during the static prerender
  onMount(() => {
    const urls: Record<string, string> = {};
    for (const note of orderedNotes) {
      for (const octave of octaves) {
        urls[`${note}${octave}`] = asset(`Piano.mf.${note}${octave}.mp3`);
      }
    }
    const next = new Sampler({
      urls,
      onload: () => {
        ready = true;
      },
      onerror: (err) => {
        console.error(err);
        onerror("Could not load the piano sounds. Reload the page to retry.");
      },
    }).toDestination();
    sampler = next;
    return () => {
      next.dispose();
    };
  });

  $effect(() => {
    if (playing !== null && song && sampler) {
      const index = playing;
      const instrument = sampler;
      const chord = song[index];
      // NOTE don't stop final note early
      const final = index + 1 === song.length;
      const duration = final ? chord.duration * 10 : chord.duration;
      // each wait is measured from when this chord was due, not from when its
      // timer fired, so late timers don't add up over a song
      if (current === null || index !== current + 1) {
        due = performance.now();
      }
      current = index;
      due += duration;
      try {
        instrument.triggerAttack(chord.notes);
      } catch (err) {
        // a sample that failed to load; skip the chord rather than stop
        console.error(err);
      }
      const num = setTimeout(
        () => {
          playing = final ? null : index + 1;
        },
        Math.max(0, due - performance.now()),
      );

      // cleanup if playback is interrupted
      return () => {
        try {
          instrument.triggerRelease(chord.notes);
        } catch (err) {
          console.error(err);
        }
        clearTimeout(num);
      };
    } else {
      current = null;
    }
  });
</script>
