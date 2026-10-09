<script lang="ts">
  import Dropzone from "svelte-file-dropzone";
  import { asset } from "$app/paths";
  import Controls from "../lib/components/Controls.svelte";
  import ImageRender from "../lib/components/ImageRender.svelte";
  import Player from "../lib/components/Player.svelte";
  import ThemeToggle from "../lib/components/ThemeToggle.svelte";
  import type { ColorChoice } from "../lib/extraction";
  import { convert } from "../lib/image";
  import type { NoteConversion } from "../lib/notes";
  import type { OrderMethod } from "../lib/order";
  import type { RefineMethod } from "../lib/refine";
  import type { RegionMethod } from "../lib/regions";
  import { meanKeyTempo, type TempoMethod } from "../lib/tempo";
  import { getImageData } from "../lib/utils";
  import type { Chord } from "../lib/worker-interface";

  let tempoMethod = $state<TempoMethod>("mean-key");
  let bpm = $state<number | null>(80);
  let duration = $state<number | null>(30); // how long should this range be?
  let region = $state<RegionMethod>("grid");
  let orderMethod = $state<OrderMethod>("word");
  let colorChoice = $state<ColorChoice>("proportional");
  let minStd = $state<number | null>(0.04);
  let noteMethod = $state<NoteConversion>("hslc");
  let refineMethod = $state<RefineMethod>("trim");
  let minWeight = $state<number | null>(0.05);
  let maxNotes = $state<number | null>(4);
  let image = $state<string | null>(null);
  let imgdata = $state.raw<ImageData | null>(null);
  let song = $state.raw<Chord[] | null>(null);
  let playing = $state<number | null>(null);
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
    if (imgdata && tempoMethod === "mean-key") {
      song = null; // clear song while we extract new tempo
      bpm = meanKeyTempo(imgdata);
      extracting = false;
    }
  });

  // based on configs, convert image to song
  $effect(() => {
    playing = null;
    song = null;
    processing = false;
    if (
      imgdata &&
      bpm !== null &&
      duration !== null &&
      minWeight !== null &&
      maxNotes !== null &&
      minStd !== null &&
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

  const progress = $derived(
    song && song.length > 0 && playing !== null
      ? ((playing + 1) / song.length) * 100
      : 0,
  );
</script>

<div class="flex flex-col items-center md:h-full">
  <header
    class="sticky top-0 z-20 w-full border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80"
  >
    <div class="flex items-center gap-3 px-4 py-3">
      <img
        src={asset("favicon.ico")}
        alt=""
        width="32"
        height="32"
        class="rounded"
      />
      <div class="leading-tight">
        <h1
          class="bg-gradient-to-r from-rose-500 via-emerald-500 to-indigo-500 bg-clip-text text-2xl font-bold text-transparent"
        >
          Synesthizer
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Turn images into piano compositions
        </p>
      </div>
      <div class="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  </header>
  <Dropzone
    accept="image/*"
    multiple={false}
    noClick
    noKeyboard
    disableDefaultStyles
    containerClasses="relative flex w-full grow flex-col gap-2 p-2 md:flex-row"
    role="presentation"
    tabindex={-1}
    bind:inputElement={picker}
    on:dragenter={() => (dragging = true)}
    on:dragleave={() => (dragging = false)}
    on:filedropped={() => (dragging = false)}
    on:drop={onDrop}
  >
    <Controls
      {song}
      hasImage={image !== null}
      onUpload={upload}
      bind:tempoMethod
      bind:bpm
      bind:duration
      bind:region
      bind:orderMethod
      bind:colorChoice
      bind:minStd
      bind:noteMethod
      bind:refineMethod
      bind:minWeight
      bind:maxNotes
      bind:playing
      {processing}
      {ready}
      {error}
    />
    <ImageRender {image} {song} {playing} {imgdata} onUpload={upload} />
    {#if dragging}
      <div
        class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-indigo-500 bg-indigo-500/10 backdrop-blur-sm"
      >
        <p class="text-lg font-bold text-indigo-700 dark:text-indigo-300">
          Drop image to upload
        </p>
      </div>
    {/if}
  </Dropzone>
  <div class="h-1 w-full">
    {#if song}
      <div
        class="h-full bg-gray-200 dark:bg-gray-800"
        role="progressbar"
        aria-label="playback progress"
        aria-valuenow={Math.round(progress)}
      >
        <div
          class="h-full bg-gradient-to-r from-rose-500 via-emerald-500 to-indigo-500 transition-[width] duration-200"
          style:width="{progress}%"
        ></div>
      </div>
    {/if}
  </div>
  <p class="sr-only" aria-live="polite">
    {processing ? "Processing…" : (song?.[playing ?? -1]?.notes.join(" ") ?? "")}
  </p>
  <Player
    {song}
    bind:playing
    bind:ready
    onerror={(message) => {
      error = message;
    }}
  />
</div>
