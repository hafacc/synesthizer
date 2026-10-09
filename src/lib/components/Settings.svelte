<script lang="ts">
  import Bug from "@lucide/svelte/icons/bug";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Grid from "@lucide/svelte/icons/grid-2x2";
  import Metronome from "@lucide/svelte/icons/metronome";
  import Music from "@lucide/svelte/icons/music";
  import Rectangle from "@lucide/svelte/icons/rectangle-horizontal";
  import Route from "@lucide/svelte/icons/route";
  import Rows from "@lucide/svelte/icons/rows-3";
  import Shapes from "@lucide/svelte/icons/shapes";
  import Shell from "@lucide/svelte/icons/shell";
  import Sliders from "@lucide/svelte/icons/sliders-horizontal";
  import Square from "@lucide/svelte/icons/square";
  import Timer from "@lucide/svelte/icons/timer";
  import Triangle from "@lucide/svelte/icons/triangle";
  import { Collapsible, Slider, Switch } from "bits-ui";
  import type { Snippet } from "svelte";
  import type { ColorChoice } from "../extraction";
  import type { FitOptions } from "../fit";
  import type { OrderMethod } from "../order";
  import type { RegionMethod } from "../regions";
  import type { TempoMethod } from "../tempo";
  import type { NoteLength } from "../worker-interface";
  import Segmented from "./Segmented.svelte";
  import SliderField from "./SliderField.svelte";
  import SwitchField from "./SwitchField.svelte";
  import TypedSelector from "./TypedSelector.svelte";

  let {
    tempoMethod = $bindable(),
    tempoSource = $bindable(),
    cycles = $bindable(),
    bpm = $bindable(),
    duration = $bindable(),
    region = $bindable(),
    orderMethod = $bindable(),
    colorChoice = $bindable(),
    minStd = $bindable(),
    minWeight = $bindable(),
    maxNotes = $bindable(),
    surround = $bindable(),
    noteLength = $bindable(),
    hold = $bindable(),
    fill = $bindable(),
    fit = $bindable(),
    showPath = $bindable(),
    onReset,
    debug,
  }: {
    tempoMethod: TempoMethod;
    // the method "match the picture" uses
    tempoSource: Exclude<TempoMethod, "manual">;
    cycles: "1" | "2";
    bpm: number | null;
    duration: number;
    region: RegionMethod;
    orderMethod: OrderMethod;
    colorChoice: ColorChoice;
    minStd: number;
    minWeight: number;
    maxNotes: number;
    surround: number;
    noteLength: NoteLength;
    hold: "hold" | "strike";
    fill: boolean;
    fit: FitOptions;
    // whether the picture shows the line the playback order follows
    showPath: boolean;
    onReset: () => void;
    debug: Snippet;
  } = $props();

  const orders: [OrderMethod, string, typeof Rows][] = [
    ["word", "Row", Rows],
    ["focal-spiral", "Spiral", Shell],
    ["path", "Path", Route],
  ];

  const carvings: [RegionMethod, string, typeof Rows][] = [
    ["grid", "Squares", Square],
    ["bisect", "Rectangles", Rectangle],
    ["shape", "Triangles", Triangle],
    ["blob", "Shapes", Shapes],
  ];

  const sources: [Exclude<TempoMethod, "manual">, string][] = [
    ["mean-key", "Mean key"],
    ["edges", "Edges"],
    ["colorfulness", "Colorfulness"],
  ];

  const penalties: [
    Exclude<keyof FitOptions, "keyFit" | "mode" | "keyChange" | "phrase">,
    string,
  ][] = [
    ["offKey", "Off-key penalty"],
    ["drop", "Dropped note penalty"],
    ["register", "Octave shift penalty"],
    ["clash", "Semitone clash penalty"],
    ["triad", "Off-triad penalty"],
    ["progression", "Weak progression penalty"],
    ["parallel", "Parallel fifth penalty"],
    ["leap", "Melody leap penalty"],
    ["movement", "Movement penalty"],
    ["ending", "Unresolved ending penalty"],
    ["mud", "Low mud penalty"],
    ["root", "Inverted chord penalty"],
    ["minorFifth", "Minor fifth penalty"],
    ["leading", "Unresolved leading note penalty"],
    ["cadence", "Missing cadence penalty"],
  ];

  const leaning = $derived(colorChoice === "new");

  const row =
    "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line py-3 first:border-t-0";
  const readout = "text-base font-semibold tabular-nums";
  const unit = "text-[12.5px] font-medium text-muted";
  const slider =
    "relative flex h-[22px] w-full touch-none items-center select-none data-disabled:opacity-45";
  const track = "relative h-1 w-full grow overflow-hidden rounded-full bg-line";
  const thumb = "block size-[18px] cursor-pointer rounded-full bg-accent";
  const step =
    "size-8 rounded-full border-[1.5px] border-line text-lg leading-none font-bold hover:border-ink transition duration-150 active:scale-[0.97] motion-reduce:transition-none";
  const trigger =
    "group flex w-full cursor-pointer items-center gap-3 py-3.5 font-semibold transition duration-150 active:scale-[0.97] motion-reduce:transition-none";
  const chevron =
    "ml-auto size-5 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none";
  const heading =
    "col-span-full mt-2 -mb-1 text-[13px] font-semibold tracking-[0.04em] text-muted uppercase";
</script>

<div class="rounded-md bg-surface px-4 py-1.5">
  <div class={row}>
    <Timer aria-hidden="true" class="size-5 text-muted" />
    <span class="font-semibold">Length</span>
    <output class={readout}>{duration} <small class={unit}>seconds</small></output>
    <Slider.Root
      type="single"
      bind:value={duration}
      min={5}
      max={300}
      step={1}
      class="{slider} col-span-full"
    >
      <span class={track}>
        <Slider.Range class="absolute h-full bg-accent" />
      </span>
      <Slider.Thumb index={0} aria-label="Length" class={thumb} />
    </Slider.Root>
  </div>
  <div class={row}>
    <Metronome aria-hidden="true" class="size-5 text-muted" />
    <span class="font-semibold">Tempo</span>
    <output class={readout}>{bpm ?? "–"} <small class={unit}>bpm</small></output>
    <div class="col-span-full flex items-center gap-2.5">
      <Slider.Root
        type="single"
        value={bpm ?? 80}
        onValueChange={(next) => {
          bpm = next;
        }}
        min={25}
        max={450}
        step={1}
        disabled={tempoMethod !== "manual"}
        class={slider}
      >
        <span class={track}>
          <Slider.Range class="absolute h-full bg-accent" />
        </span>
        <Slider.Thumb index={0} aria-label="Tempo" class={thumb} />
      </Slider.Root>
      <label
        class="inline-flex cursor-pointer items-center gap-2 text-[13px] whitespace-nowrap text-muted"
      >
        <Switch.Root
          checked={tempoMethod !== "manual"}
          onCheckedChange={(matched) => {
            tempoMethod = matched ? tempoSource : "manual";
          }}
          class="h-5 w-[34px] flex-none rounded-full bg-line transition-colors data-[state=checked]:bg-accent motion-reduce:transition-none"
        >
          <Switch.Thumb
            class="block size-3.5 translate-x-[3px] rounded-full bg-raised transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-accent-ink motion-reduce:transition-none"
          />
        </Switch.Root>
        Match the picture
      </label>
    </div>
    {#if tempoMethod !== "manual"}
      <Segmented
        value={tempoSource}
        values={sources}
        label="Tempo from"
        tall
        onchange={(next) => {
          tempoSource = next;
          tempoMethod = next;
        }}
      />
    {/if}
  </div>
  <div class={row}>
    <Grid aria-hidden="true" class="size-5 text-muted" />
    <span class="col-span-2 font-semibold" id="regions-name">Regions</span>
    <Segmented
      bind:value={region}
      values={carvings}
      labelledby="regions-name"
      tall
    />
  </div>
  <!-- hovering or tapping the order draws its path on the picture -->
  <div
    class={row}
    role="group"
    onpointerenter={() => {
      showPath = true;
    }}
    onpointerleave={() => {
      showPath = false;
    }}
  >
    <Rows aria-hidden="true" class="size-5 text-muted" />
    <span class="col-span-2 font-semibold" id="order-name">Reading order</span>
    <Segmented
      bind:value={orderMethod}
      values={orders}
      labelledby="order-name"
      tall
    />
  </div>
  <div class={row}>
    <Music aria-hidden="true" class="size-5 text-muted" />
    <span class="font-semibold" id="voices-name">Notes at once</span>
    <div
      class="inline-flex items-center gap-1"
      role="group"
      aria-labelledby="voices-name"
    >
      <button
        class={step}
        type="button"
        aria-label="Fewer notes at once"
        onclick={() => {
          maxNotes = Math.max(1, maxNotes - 1);
        }}>&minus;</button
      >
      <output class="{readout} min-w-[30px] text-center">{maxNotes}</output>
      <button
        class={step}
        type="button"
        aria-label="More notes at once"
        onclick={() => {
          maxNotes = Math.min(12, maxNotes + 1);
        }}>+</button
      >
    </div>
  </div>
</div>

<Collapsible.Root class="rounded-md bg-surface px-4">
  <Collapsible.Trigger class={trigger}>
    <Sliders aria-hidden="true" class="size-5 text-muted" />Fine tuning
    <ChevronDown aria-hidden="true" class={chevron} />
  </Collapsible.Trigger>
  <Collapsible.Content class="grid grid-cols-2 gap-3 pt-1 pb-4">
    <button
      class="col-span-full h-[38px] rounded-full border-[1.5px] border-line text-[13px] font-semibold hover:border-ink transition duration-150 active:scale-[0.97] motion-reduce:transition-none"
      type="button"
      onclick={onReset}
    >
      Reset to defaults
    </button>
    <h3 class={heading}>Chords</h3>
    <TypedSelector
      title="Color selection"
      bind:value={colorChoice}
      values={[
        ["mean", "Mean"],
        ["xmeans", "X-Means"],
        ["proportional", "Proportional"],
        ["new", "Hue peaks"],
      ]}
    />
    <TypedSelector
      title="Hue cycles"
      bind:value={cycles}
      values={[
        ["1", "1"],
        ["2", "2"],
      ]}
    />
    <SliderField
      title="Minimum note proportion"
      max={0.5}
      step={0.01}
      bind:value={minWeight}
    />
    <SliderField
      title="X-Means min deviation"
      max={0.5}
      step={0.01}
      disabled={colorChoice !== "xmeans"}
      bind:value={minStd}
    />
    <SliderField
      title="Surrounding color share"
      max={0.9}
      step={0.1}
      disabled={!leaning}
      bind:value={surround}
    />

    <h3 class={heading}>Regions and playback</h3>
    <TypedSelector
      title="Note lengths"
      bind:value={noteLength}
      values={[
        ["even", "Even"],
        ["area", "By area"],
      ]}
    />
    <TypedSelector
      title="Repeated notes"
      bind:value={hold}
      values={[
        ["strike", "Strike"],
        ["hold", "Hold"],
      ]}
    />

    <h3 class={heading}>Key fitting</h3>
    <TypedSelector
      title="Key fitting"
      bind:value={fit.keyFit}
      values={[
        ["off", "Off"],
        ["one", "One key"],
        ["change", "One key change"],
      ]}
    />
    {#if fit.keyFit !== "off"}
      <TypedSelector
        title="Key mode"
        bind:value={fit.mode}
        values={[
          ["any", "Any"],
          ["major", "Major"],
          ["minor", "Minor"],
        ]}
      />
      <SwitchField title="Fill triads" bind:checked={fill} />
      <SliderField
        title="Phrase length"
        max={16}
        step={1}
        bind:value={fit.phrase}
      />
      {#each penalties as [name, title] (name)}
        <SliderField {title} max={8} step={0.1} bind:value={fit[name]} />
      {/each}
      {#if fit.keyFit === "change"}
        <SliderField
          title="Key change penalty"
          max={8}
          step={0.1}
          bind:value={fit.keyChange}
        />
      {/if}
    {/if}
  </Collapsible.Content>
</Collapsible.Root>

<Collapsible.Root class="rounded-md bg-surface px-4">
  <Collapsible.Trigger class={trigger}>
    <Bug aria-hidden="true" class="size-5 text-muted" />Debug view
    <ChevronDown aria-hidden="true" class={chevron} />
  </Collapsible.Trigger>
  <Collapsible.Content class="pb-4">
    {@render debug()}
  </Collapsible.Content>
</Collapsible.Root>
