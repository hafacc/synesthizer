<script lang="ts">
  import CloudUpload from "@lucide/svelte/icons/cloud-upload";
  import type { Chord } from "../worker-interface";
  import ImageOverlay from "./ImageOverlay.svelte";

  const {
    image,
    imgdata,
    song,
    playing,
    onUpload,
  }: {
    image: string | null;
    imgdata: ImageData | null;
    song: Chord[] | null;
    playing: number | null;
    onUpload: () => void;
  } = $props();
</script>

<div class="relative order-1 grow self-stretch md:order-2">
  {#if image}
    <div class="relative h-screen md:h-full">
      <img
        src={image}
        alt="uploaded synth"
        class="absolute inset-0 h-full w-full object-contain"
      />
      {#if imgdata}
        <ImageOverlay {imgdata} {song} {playing} />
      {/if}
    </div>
  {:else}
    <button
      type="button"
      onclick={onUpload}
      class="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-6 text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-indigo-500"
    >
      <CloudUpload aria-hidden="true" class="h-12 w-12 shrink-0" />
      <span class="max-w-full text-center text-lg font-semibold text-balance">
        Drop an image here, or click to upload
      </span>
      <span class="max-w-full text-center text-sm text-balance">
        It will be transcribed into a piano piece
      </span>
    </button>
  {/if}
</div>
