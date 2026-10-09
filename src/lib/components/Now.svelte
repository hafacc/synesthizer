<script lang="ts">
  import { spell } from "../notes";
  import type { Chord } from "../worker-interface";
  import NoteName from "./NoteName.svelte";

  const {
    song,
    shown,
    hasImage,
  }: {
    song: Chord[] | null;
    // index of the region under the cursor, or null before the song starts
    shown: number | null;
    hasImage: boolean;
  } = $props();

  const chip =
    "inline-flex h-[26px] items-center rounded-full bg-wall px-2.5 font-note text-[13px] font-medium tabular-nums";

  const chord = $derived(song?.[shown ?? 0] ?? null);
</script>

<div
  class="grid min-h-[158px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-md bg-surface p-4"
>
  {#if song === null || song.length === 0 || chord === null}
    <p class="col-span-full text-center text-muted">
      {hasImage ? "Processing…" : "Upload a picture to get started"}
    </p>
  {:else}
    <div
      class="col-span-full flex justify-between gap-3 text-[13px] font-semibold text-muted tabular-nums"
    >
      <span>
        {shown === null ? "Starts on" : `Region ${shown + 1} of ${song.length}`}
      </span>
      {#if chord.key}
        <span>{spell(chord.key, chord.sharps)}</span>
      {/if}
    </div>
    <div
      class="size-[84px] rounded-md inset-ring inset-ring-ink/12 transition-colors motion-reduce:transition-none"
      style:background-color={chord.color}
    ></div>
    <div
      class="font-note text-[64px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap"
    >
      {#if chord.notes.length > 0}
        <NoteName name={chord.notes[0]} sharps={chord.sharps} large />
      {:else}
        –
      {/if}
    </div>
    <div class="col-span-full flex min-h-[26px] flex-wrap gap-1.5">
      {#each chord.notes as name (name)}
        <span class={chip}><NoteName {name} sharps={chord.sharps} /></span>
      {/each}
      {#each chord.soft as name (name)}
        <span class="{chip} text-muted">
          <NoteName {name} sharps={chord.sharps} />
        </span>
      {/each}
    </div>
  {/if}
</div>
