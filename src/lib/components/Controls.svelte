<script lang="ts">
  import { start } from "tone";
  import type { ColorChoice } from "../extraction";
  import type { FitDraft, FitOptions } from "../fit";
  import type { NoteConversion } from "../notes";
  import type { OrderMethod } from "../order";
  import type { RefineMethod } from "../refine";
  import type { RegionMethod } from "../regions";
  import type { TempoMethod } from "../tempo";
  import type { Chord, NoteLength } from "../worker-interface";
  import NumericSelector from "./NumericSelector.svelte";
  import TypedSelector from "./TypedSelector.svelte";

  let {
    song,
    hasImage,
    onUpload,
    tempoMethod = $bindable(),
    bpm = $bindable(),
    duration = $bindable(),
    region = $bindable(),
    orderMethod = $bindable(),
    colorChoice = $bindable(),
    minStd = $bindable(),
    noteMethod = $bindable(),
    refineMethod = $bindable(),
    minWeight = $bindable(),
    maxNotes = $bindable(),
    surround = $bindable(),
    noteLength = $bindable(),
    hold = $bindable(),
    fill = $bindable(),
    fit = $bindable(),
    playing = $bindable(),
    processing,
    ready,
    error,
  }: {
    song: Chord[] | null;
    hasImage: boolean;
    onUpload: () => void;
    tempoMethod: TempoMethod;
    bpm: number | null;
    duration: number | null;
    region: RegionMethod;
    orderMethod: OrderMethod;
    colorChoice: ColorChoice;
    minStd: number | null;
    noteMethod: NoteConversion;
    refineMethod: RefineMethod;
    minWeight: number | null;
    maxNotes: number | null;
    surround: number | null;
    noteLength: NoteLength;
    hold: "hold" | "strike";
    fill: "off" | "on";
    fit: FitDraft;
    playing: number | null;
    processing: boolean;
    ready: boolean;
    error: string | null;
  } = $props();

  const penalties: [
    Exclude<keyof FitOptions, "keyFit" | "mode" | "keyChange" | "phrase">,
    string,
  ][] =
    [
      ["offKey", "Off-Key Penalty"],
      ["drop", "Dropped Note Penalty"],
      ["register", "Octave Shift Penalty"],
      ["clash", "Semitone Clash Penalty"],
      ["triad", "Off-Triad Penalty"],
      ["progression", "Weak Progression Penalty"],
      ["parallel", "Parallel Fifth Penalty"],
      ["leap", "Melody Leap Penalty"],
      ["movement", "Movement Penalty"],
      ["ending", "Unresolved Ending Penalty"],
      ["mud", "Low Mud Penalty"],
      ["root", "Inverted Chord Penalty"],
      ["minorFifth", "Minor Fifth Penalty"],
      ["leading", "Unresolved Leading Note Penalty"],
      ["cadence", "Missing Cadence Penalty"],
    ];

  // one button for every state, marked rather than natively disabled, so
  // keyboard focus stays on it as it changes
  const blocked = $derived(
    processing ||
      (playing === null && (!ready || song === null || song.length === 0)),
  );
  const look = $derived(
    processing
      ? "animate-pulse cursor-not-allowed bg-gray-400 text-gray-200"
      : playing !== null
        ? "bg-red-500 text-white hover:bg-red-600"
        : blocked
          ? "cursor-not-allowed bg-gray-400 text-gray-200 dark:bg-gray-700 dark:text-gray-400"
          : "bg-gradient-to-r from-rose-500 from-10% via-emerald-500 via-50% to-indigo-500 to-90% text-white hover:from-rose-600 hover:via-emerald-600 hover:to-indigo-600",
  );

  function toggle(): void {
    if (!blocked) {
      if (playing === null) {
        // browsers only let audio start from inside a click
        void start();
        playing = 0;
      } else {
        playing = null;
      }
    }
  }
</script>

<div class="order-2 flex shrink-0 flex-col gap-y-2 md:order-1 md:w-sm">
  {#if hasImage}
    <button
      type="button"
      onclick={onUpload}
      class="w-full rounded bg-gradient-to-r from-rose-500 from-10% via-emerald-500 via-50% to-indigo-500 to-90% p-2 font-bold text-white hover:from-rose-600 hover:via-emerald-600 hover:to-indigo-600"
    >
      Replace image
    </button>
  {/if}
  <NumericSelector
    title="Duration (seconds)"
    min={1}
    max={600}
    bind:value={duration}
  />
  <TypedSelector
    title="Tempo Method"
    bind:value={tempoMethod}
    values={[
      ["manual", "Manual"],
      ["mean-key", "Mean Key"],
    ]}
  />
  <NumericSelector
    title="Tempo (bpm)"
    min={25}
    max={500}
    disabled={tempoMethod !== "manual"}
    bind:value={bpm}
  />
  <TypedSelector
    title="Color Selection"
    bind:value={colorChoice}
    values={[
      ["mean", "Mean"],
      ["xmeans", "X-Means"],
      ["proportional", "Proportional"],
      ["new", "New"],
    ]}
  />
  <NumericSelector
    title="X-Means Min Deviation"
    min={0}
    max={1}
    step={0.01}
    bind:value={minStd}
  />
  <NumericSelector
    title="Minimum Note Proportion"
    min={0}
    max={1}
    step={0.05}
    bind:value={minWeight}
  />
  <NumericSelector
    title="Maximum Simultaneous Notes"
    min={1}
    max={12}
    integer
    bind:value={maxNotes}
  />
  <TypedSelector
    title="Region Selection"
    bind:value={region}
    values={[
      ["grid", "Grid"],
      ["bisect", "Bisection"],
      ["shape", "Free Shapes"],
    ]}
  />
  <TypedSelector
    title="Order Selection"
    bind:value={orderMethod}
    values={[
      ["word", "Word Order"],
      ["focal-spiral", "Focal Spiral"],
      ["path", "Shortest Path"],
    ]}
  />
  <TypedSelector
    title="Note Conversion"
    bind:value={noteMethod}
    values={[["hslc", "HSL Cone"]]}
  />
  <TypedSelector
    title="Refine Method"
    bind:value={refineMethod}
    values={[["trim", "Trim"]]}
  />
  <TypedSelector
    title="Note Lengths"
    bind:value={noteLength}
    values={[
      ["even", "Even"],
      ["area", "By Area"],
    ]}
  />
  <TypedSelector
    title="Repeated Notes"
    bind:value={hold}
    values={[
      ["strike", "Strike Again"],
      ["hold", "Hold"],
    ]}
  />
  {#if colorChoice === "new"}
    <NumericSelector
      title="Surrounding Color Share"
      min={0}
      max={0.9}
      step={0.1}
      bind:value={surround}
    />
    <TypedSelector
      title="Key Fitting"
      bind:value={fit.keyFit}
      values={[
        ["off", "Off"],
        ["one", "One Key"],
        ["change", "One Key Change"],
      ]}
    />
    {#if fit.keyFit !== "off"}
      <TypedSelector
        title="Key Mode"
        bind:value={fit.mode}
        values={[
          ["any", "Any"],
          ["major", "Major"],
          ["minor", "Minor"],
        ]}
      />
      <TypedSelector
        title="Fill Triads"
        bind:value={fill}
        values={[
          ["off", "Off"],
          ["on", "On"],
        ]}
      />
      <NumericSelector
        title="Phrase Length"
        min={0}
        integer
        bind:value={fit.phrase}
      />
      {#each penalties as [name, title] (name)}
        <NumericSelector {title} min={0} step={0.1} bind:value={fit[name]} />
      {/each}
      {#if fit.keyFit === "change"}
        <NumericSelector
          title="Key Change Penalty"
          min={0}
          step={0.1}
          bind:value={fit.keyChange}
        />
      {/if}
    {/if}
  {/if}
  {#if song && playing !== null && song[playing]?.key}
    <p class="text-sm font-semibold">{song[playing].key}</p>
  {/if}
  {#if error}
    <div
      class="w-full rounded border border-red-400 bg-red-100 p-2 text-red-700 dark:border-red-500/50 dark:bg-red-950/50 dark:text-red-300"
      role="alert"
    >
      {error}
    </div>
  {/if}
  <div class="grow"></div>
  <button
    type="button"
    aria-disabled={blocked}
    onclick={toggle}
    class="w-full rounded p-2 font-bold {look}"
  >
    {processing
      ? "Processing…"
      : playing !== null
        ? "Stop"
        : ready
          ? "Play"
          : "Loading piano…"}
  </button>
</div>
