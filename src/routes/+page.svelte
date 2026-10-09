<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
  import FileMusic from "@lucide/svelte/icons/file-music";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Dropzone from "svelte-file-dropzone";
  import { start } from "tone";
  import HueCone from "../lib/components/HueCone.svelte";
  import Mark from "../lib/components/Mark.svelte";
  import Now from "../lib/components/Now.svelte";
  import Player from "../lib/components/Player.svelte";
  import Settings from "../lib/components/Settings.svelte";
  import SheetMusic from "../lib/components/SheetMusic.svelte";
  import Stage from "../lib/components/Stage.svelte";
  import ThemeToggle from "../lib/components/ThemeToggle.svelte";
  import Transport from "../lib/components/Transport.svelte";
  import type { ColorChoice } from "../lib/extraction";
  import type { FitOptions } from "../lib/fit";
  import { convert } from "../lib/image";
  import type { NoteConversion } from "../lib/notes";
  import type { OrderMethod } from "../lib/order";
  import type { RefineMethod } from "../lib/refine";
  import type { RegionMethod } from "../lib/regions";
  import { type TempoMethod, tempoOf } from "../lib/tempo";
  import { getImageData, save } from "../lib/utils";
  import type { Chord, NoteLength } from "../lib/worker-interface";

  // penalties are in semitones of movement: moving a whole chord's weight one
  // semitone against its hue costs 1
  const defaults: {
    tempoMethod: TempoMethod;
    // the method "match the picture" uses
    tempoSource: Exclude<TempoMethod, "manual">;
    cycles: "1" | "2";
    duration: number;
    region: RegionMethod;
    orderMethod: OrderMethod;
    colorChoice: ColorChoice;
    minStd: number;
    noteMethod: NoteConversion;
    refineMethod: RefineMethod;
    minWeight: number;
    surround: number;
    noteLength: NoteLength;
    hold: "hold" | "strike";
    fill: boolean;
    maxNotes: number;
    fit: FitOptions;
  } = {
    tempoMethod: "edges",
    tempoSource: "edges",
    cycles: "1",
    duration: 30,
    region: "shape",
    orderMethod: "path",
    colorChoice: "proportional",
    minStd: 0.04,
    noteMethod: "hslc",
    refineMethod: "trim",
    minWeight: 0.02,
    surround: 0.5,
    noteLength: "area",
    hold: "hold",
    fill: false,
    maxNotes: 3,
    fit: {
      keyFit: "one",
      mode: "any",
      offKey: 8,
      drop: 2,
      register: 0.5,
      clash: 3,
      triad: 2,
      progression: 0.2,
      parallel: 2,
      leap: 1,
      movement: 0.3,
      ending: 1,
      mud: 3,
      root: 0.5,
      minorFifth: 0.5,
      leading: 1,
      phrase: 8,
      cadence: 1,
      keyChange: 3,
    },
  };

  let tempoMethod = $state(defaults.tempoMethod);
  let tempoSource = $state(defaults.tempoSource);
  let cycles = $state(defaults.cycles);
  let bpm = $state<number | null>(80);
  let duration = $state(defaults.duration);
  let region = $state(defaults.region);
  let orderMethod = $state(defaults.orderMethod);
  let colorChoice = $state(defaults.colorChoice);
  let minStd = $state(defaults.minStd);
  let noteMethod = $state(defaults.noteMethod);
  let fit = $state<FitOptions>({ ...defaults.fit });
  let refineMethod = $state(defaults.refineMethod);
  let minWeight = $state(defaults.minWeight);
  let surround = $state(defaults.surround);
  let noteLength = $state(defaults.noteLength);
  let hold = $state(defaults.hold);
  let fill = $state(defaults.fill);
  let maxNotes = $state(defaults.maxNotes);
  let image = $state<string | null>(null);
  let imgdata = $state.raw<ImageData | null>(null);
  let song = $state.raw<Chord[] | null>(null);
  let playing = $state<number | null>(null);
  // where playback will start from: set by clicking a region or the strip
  let cursor = $state<number | null>(null);
  let showPath = $state(false);
  let showSheet = $state(false);
  let exporting = $state(false);
  let processing = $state(false);
  let error = $state<string | null>(null);
  let extracting = $state(false);
  let ready = $state(false);
  let dragging = $state(false);
  let picker = $state<HTMLInputElement | null>(null);

  // a dropped/selected file becomes the new working image, releasing the old url
  function onDrop(
    event: CustomEvent<{ acceptedFiles: File[]; fileRejections: unknown[] }>,
  ): void {
    dragging = false;
    const { acceptedFiles, fileRejections } = event.detail;
    const [file] = acceptedFiles;
    if (file) {
      if (image) URL.revokeObjectURL(image);
      image = URL.createObjectURL(file);
    } else if (fileRejections.length > 0) {
      error = "Drop a single image file.";
    }
  }

  function remove(): void {
    if (image) URL.revokeObjectURL(image);
    image = null;
  }

  function reset(): void {
    ({
      tempoMethod,
      tempoSource,
      cycles,
      duration,
      region,
      orderMethod,
      colorChoice,
      minStd,
      noteMethod,
      refineMethod,
      minWeight,
      surround,
      noteLength,
      hold,
      fill,
      maxNotes,
    } = defaults);
    fit = { ...defaults.fit };
  }

  // moves the cursor and pauses there; play carries on from it
  function seek(index: number): void {
    if (song && index < song.length) {
      playing = null;
      cursor = index;
    }
  }

  function toggle(): void {
    if (playing !== null) {
      // stopping leaves the cursor where the song was
      cursor = playing;
      playing = null;
    } else if (ready && !processing && song && song.length > 0) {
      // browsers only let audio start from inside a click or key press
      void start();
      playing = cursor ?? 0;
      cursor = null;
    }
  }

  // render the song to an audio file and hand it to the browser to save
  function exportAudio(): void {
    if (song && song.length > 0 && !exporting) {
      exporting = true;
      import("../lib/render")
        .then(({ renderAudio }) => renderAudio(song ?? [], hold === "hold"))
        .then(
          ({ file, extension }) => {
            save(file, `synesthizer.${extension}`);
          },
          (err) => {
            console.error(err);
            error = `Could not export the audio: ${err}`;
          },
        )
        .finally(() => {
          exporting = false;
        });
    }
  }

  function upload(): void {
    if (picker) {
      // let the same file be picked again
      picker.value = "";
      picker.click();
    }
  }

  // if we upload a new image, parse it into data
  $effect(() => {
    const url = image;
    playing = null;
    imgdata = null;
    extracting = true;
    if (url) {
      error = null;
      let cancelled = false;
      getImageData(url).then(
        (data) => {
          if (!cancelled) {
            imgdata = data;
          }
        },
        (err) => {
          console.error(err);
          if (!cancelled) {
            error = `${err}`;
          }
        },
      );
      return () => {
        cancelled = true;
      };
    }
  });

  // if tempo method is set, look at the image to extract tempo
  $effect(() => {
    playing = null;
    if (imgdata && tempoMethod !== "manual") {
      song = null; // clear song while we extract new tempo
      bpm = tempoOf(imgdata, tempoMethod);
      extracting = false;
    }
  });

  // based on configs, convert image to song
  $effect(() => {
    playing = null;
    cursor = null;
    song = null;
    processing = false;
    if (
      imgdata &&
      bpm !== null &&
      (tempoMethod === "manual" || !extracting)
    ) {
      const img = imgdata;
      const options = {
        bpm,
        duration,
        region,
        order: orderMethod,
        colorChoice,
        minStd,
        noteMethod,
        refineMethod,
        minWeight,
        maxNotes,
        cycles: Number(cycles),
        surround,
        noteLength,
        fill,
        fit: $state.snapshot(fit),
      };
      const controller = new AbortController();
      processing = true;
      error = null;
      // wait half a second before computing in case there are more changes
      const timer = setTimeout(() => {
        convert(img, options, controller.signal).then(
          (chords) => {
            if (!controller.signal.aborted) {
              song = chords;
              processing = false;
            }
          },
          (err) => {
            if (!controller.signal.aborted) {
              console.error(err);
              processing = false;
              error = `${err}`;
            }
          },
        );
      }, 500);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
  });

  const hasSong = $derived(song !== null && song.length > 0);
  const tool =
    "grid size-10 place-items-center rounded-full border-[1.5px] border-line hover:border-ink transition duration-150 active:scale-[0.97] motion-reduce:transition-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-line aria-disabled:active:scale-100";
</script>

<svelte:window
  onkeydown={(event) => {
    if (
      event.code === "Space" &&
      event.target instanceof Element &&
      !event.target.closest("input, select, button, summary, label")
    ) {
      event.preventDefault();
      toggle();
    }
  }}
/>

<div
  class="mx-auto flex max-w-[1360px] flex-col gap-3.5 px-4 pt-3 pb-7 min-[900px]:px-6"
>
  <header class="flex items-center gap-3">
    <Mark />
    <div class="min-w-0">
      <h1 class="text-[22px] leading-[1.1] font-bold tracking-[-0.01em]">
        Synesthizer
      </h1>
      <p class="mt-[3px] text-xs text-muted min-[421px]:text-[13px]">
        Turn images into piano compositions
      </p>
    </div>
    <div class="ml-auto flex gap-2">
      <button
        class={tool}
        type="button"
        aria-disabled={!hasSong}
        aria-label="Sheet music"
        title="Sheet music"
        onclick={() => {
          showSheet = hasSong;
        }}
      >
        <FileMusic aria-hidden="true" class="size-5" />
      </button>
      <button
        class={tool}
        type="button"
        aria-disabled={!hasSong || exporting}
        aria-label="Export audio"
        title="Export audio"
        onclick={exportAudio}
      >
        {#if exporting}
          <LoaderCircle aria-hidden="true" class="size-5 animate-spin" />
        {:else}
          <Download aria-hidden="true" class="size-5" />
        {/if}
      </button>
      <ThemeToggle />
    </div>
  </header>
  {#if song && bpm !== null}
    <SheetMusic bind:open={showSheet} {song} {bpm} />
  {/if}
  <Dropzone
    accept="image/*"
    multiple={false}
    noClick
    noKeyboard
    disableDefaultStyles
    containerClasses="relative grid grid-cols-[minmax(0,1fr)] gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_348px] min-[900px]:items-start"
    role="presentation"
    tabindex={-1}
    bind:inputElement={picker}
    on:dragenter={() => (dragging = true)}
    on:dragleave={() => (dragging = false)}
    on:filedropped={() => (dragging = false)}
    on:drop={onDrop}
  >
    <Stage
      {image}
      {imgdata}
      {song}
      {playing}
      shown={playing ?? cursor}
      {showPath}
      {dragging}
      {error}
      onUpload={upload}
      onRemove={remove}
      onSeek={seek}
    />
    <section class="min-w-0 min-[900px]:col-start-1" aria-label="Playback">
      <Transport
        {song}
        {playing}
        shown={playing ?? cursor}
        {processing}
        {ready}
        {bpm}
        onToggle={toggle}
        onSeek={seek}
      />
    </section>
    <aside
      class="flex min-w-0 flex-col gap-3.5 *:shrink-0 min-[900px]:sticky min-[900px]:top-3 min-[900px]:col-start-2 min-[900px]:row-span-2 min-[900px]:row-start-1 min-[900px]:max-h-[calc(100vh-99px)] min-[900px]:overflow-y-auto min-[900px]:[scrollbar-width:thin]"
      aria-label="Settings"
    >
      <Now {song} shown={playing ?? cursor} hasImage={image !== null} />
      {#if error && image}
        <p class="font-semibold text-signal" role="alert">{error}</p>
      {/if}
      <Settings
        bind:tempoMethod
        bind:tempoSource
        bind:cycles
        bind:bpm
        bind:duration
        bind:region
        bind:orderMethod
        bind:colorChoice
        bind:minStd
        bind:minWeight
        bind:maxNotes
        bind:surround
        bind:noteLength
        bind:hold
        bind:fill
        bind:fit
        bind:showPath
        onReset={reset}
      >
        {#snippet debug()}
          <HueCone
            {imgdata}
            chord={song?.[playing ?? cursor ?? -1] ?? null}
            cycles={Number(cycles)}
          />
        {/snippet}
      </Settings>
    </aside>
  </Dropzone>
  <p class="sr-only" aria-live="polite">
    {processing ? "Processing…" : (song?.[playing ?? -1]?.notes.join(" ") ?? "")}
  </p>
  <Player
    {song}
    bind:playing
    bind:ready
    hold={hold === "hold"}
    onerror={(message) => {
      error = message;
    }}
  />
</div>
