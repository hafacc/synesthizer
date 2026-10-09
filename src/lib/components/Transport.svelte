<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import type { Chord } from "../worker-interface";

  const {
    song,
    playing,
    shown,
    processing,
    ready,
    bpm,
    onToggle,
    onSeek,
  }: {
    song: Chord[] | null;
    playing: number | null;
    // index of the region under the cursor, playing or not
    shown: number | null;
    processing: boolean;
    ready: boolean;
    bpm: number | null;
    onToggle: () => void;
    onSeek: (index: number) => void;
  } = $props();

  // one button for every state, marked rather than natively disabled, so
  // keyboard focus stays on it as it changes
  const blocked = $derived(
    processing ||
      (playing === null && (!ready || song === null || song.length === 0)),
  );

  function clock(milliseconds: number): string {
    const seconds = Math.round(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${`${seconds % 60}`.padStart(2, "0")}`;
  }

  // when each chord starts, with the total length last
  const starts = $derived.by(() => {
    const times = [0];
    for (const { duration } of song ?? []) {
      times.push(times[times.length - 1] + duration);
    }
    return times;
  });
  const total = $derived(starts[starts.length - 1]);
  const elapsed = $derived(shown === null ? 0 : (starts[shown] ?? 0));
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2.5">
  <button
    class="inline-flex h-13 min-w-[124px] items-center justify-center gap-2.5 rounded-full px-[22px] text-base font-semibold hover:brightness-110 transition duration-150 active:scale-[0.97] motion-reduce:transition-none aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 aria-disabled:opacity-40 aria-disabled:hover:brightness-100 motion-reduce:animate-none {processing
      ? 'animate-busy bg-accent text-accent-ink'
      : playing !== null
        ? 'bg-signal text-signal-ink'
        : 'bg-accent text-accent-ink'}"
    type="button"
    aria-disabled={blocked}
    onclick={onToggle}
  >
    {#if processing}
      Processing…
    {:else if playing !== null}
      <Square aria-hidden="true" class="size-[18px] fill-current" />Stop
    {:else if ready}
      <Play aria-hidden="true" class="size-[18px] fill-current" />Play
    {:else}
      Loading piano…
    {/if}
  </button>
  <div class="text-xl leading-none font-semibold whitespace-nowrap tabular-nums">
    {clock(elapsed)}<small class="ml-1 text-[13px] font-medium text-muted"
      >of {clock(total)}</small
    >
  </div>
  {#if song && song.length > 0}
    <button
      class="relative flex h-[30px] min-w-0 flex-[1_1_260px] overflow-hidden rounded-[3px] bg-mat max-[899px]:order-5 max-[899px]:basis-full"
      type="button"
      title="Click to play from here"
      aria-label="Playback progress. Click to play from a point"
      onclick={(event) => {
        const { left, width } = event.currentTarget.getBoundingClientRect();
        const time = ((event.clientX - left) / width) * total;
        onSeek(Math.max(0, starts.findLastIndex((start) => start <= time)));
      }}
    >
      {#each song as chord (chord.id)}
        <span
          class="min-w-0 basis-0"
          style:flex-grow={chord.duration}
          style:background={chord.color}
        ></span>
      {/each}
      {#if shown !== null}
        <span
          class="absolute inset-y-0 left-0 border-r-3 border-ink bg-wall/55 transition-[width] duration-100 ease-linear motion-reduce:transition-none"
          style:width="{((starts[shown + (playing === null ? 0 : 1)] ??
            total) /
            total) *
            100}%"
        ></span>
      {/if}
    </button>
    <div
      class="text-[13px] whitespace-nowrap text-muted tabular-nums max-[899px]:ml-auto"
    >
      {song.length} regions at {bpm} bpm
    </div>
  {/if}
</div>
