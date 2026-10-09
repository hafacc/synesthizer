<script lang="ts">
  import { onMount } from "svelte";
  import { Sampler } from "tone";
  import { fade, sampleUrls } from "../samples";
  import { softVelocity } from "../score";
  import type { Chord } from "../worker-interface";

  let {
    song,
    playing = $bindable(),
    ready = $bindable(),
    hold,
    onerror,
  }: {
    song: Chord[] | null;
    playing: number | null;
    ready: boolean;
    // whether a note shared with the previous chord keeps ringing
    hold: boolean;
    onerror: (message: string) => void;
  } = $props();


  let sampler = $state.raw<Sampler | null>(null);
  // index of the chord sounding now, and when it was due to start
  let current: number | null = null;
  let due = 0;
  // notes struck and not yet released
  let sounding = new Set<string>();

  function release(instrument: Sampler, notes: Iterable<string>): void {
    try {
      instrument.triggerRelease([...notes]);
    } catch (err) {
      console.error(err);
    }
  }

  // mounting only happens in the browser, so the audio sampler is never
  // constructed during the static prerender
  onMount(() => {
    const next = new Sampler({
      urls: sampleUrls(),
      release: fade,
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
      const wanted = new Set<string>([...chord.notes, ...chord.soft]);
      const kept = hold ? sounding.intersection(wanted) : new Set<string>();
      release(instrument, sounding.difference(kept));
      const fresh = (notes: readonly string[]): string[] =>
        notes.filter((note) => !kept.has(note));
      try {
        instrument.triggerAttack(fresh(chord.notes), undefined, chord.velocity);
        instrument.triggerAttack(fresh(chord.soft), undefined, softVelocity);
      } catch (err) {
        // a sample that failed to load; skip the chord rather than stop
        console.error(err);
      }
      sounding = wanted;
      const num = setTimeout(
        () => {
          playing = final ? null : index + 1;
        },
        Math.max(0, due - performance.now()),
      );

      return () => {
        clearTimeout(num);
      };
    } else {
      current = null;
      if (sampler) {
        release(sampler, sounding);
      }
      sounding = new Set<string>();
    }
  });
</script>
