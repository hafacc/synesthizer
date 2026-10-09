<script lang="ts">
  import Download from "@lucide/svelte/icons/download";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import X from "@lucide/svelte/icons/x";
  import { Dialog } from "bits-ui";
  import { toAbc } from "../score";
  import { save } from "../utils";
  import type { Chord } from "../worker-interface";

  let {
    open = $bindable(),
    song,
    bpm,
  }: {
    open: boolean;
    song: Chord[];
    bpm: number;
  } = $props();

  const tool =
    "grid size-10 place-items-center rounded-full border-[1.5px] border-line transition duration-150 hover:border-ink active:scale-[0.97] motion-reduce:transition-none";

  let saving = $state(false);

  function download(): void {
    if (!saving) {
      saving = true;
      import("../pdf")
        .then(({ abcToPdf }) => abcToPdf(toAbc(song, bpm)))
        .then(
          (pdf) => save(pdf, "synesthizer.pdf"),
          (err) => console.error(err),
        )
        .finally(() => {
          saving = false;
        });
    }
  }

  let host = $state<HTMLDivElement | null>(null);
  let width = $state(0);

  // the staves are laid out again for the page's width whenever it changes,
  // so each line holds as many bars as fit
  $effect(() => {
    if (host) {
      const sized = new ResizeObserver(([entry]) => {
        width = Math.floor(entry.contentRect.width);
      });
      sized.observe(host);
      return () => sized.disconnect();
    }
  });

  $effect(() => {
    const target = host;
    const abc = toAbc(song, bpm);
    if (target && width > 0) {
      let stale = false;
      import("abcjs").then(({ renderAbc }) => {
        if (!stale) {
          renderAbc(target, abc, {
            staffwidth: width - 30,
            wrap: {
              minSpacing: 1.8,
              maxSpacing: 2.7,
              preferredMeasuresPerLine: Math.max(1, Math.round(width / 260)),
            },
            foregroundColor: "currentColor",
            paddingleft: 0,
            paddingright: 0,
          });
        }
      });
      return () => {
        stale = true;
      };
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Content
      class="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-wall text-ink"
    >
      <div
        class="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-wall px-4 py-3 min-[900px]:px-6"
      >
        <Dialog.Title class="text-lg font-bold">Sheet music</Dialog.Title>
        <button
          class="{tool} ml-auto"
          type="button"
          aria-label="Download"
          title="Download"
          onclick={download}
        >
          {#if saving}
            <LoaderCircle aria-hidden="true" class="size-5 animate-spin" />
          {:else}
            <Download aria-hidden="true" class="size-5" />
          {/if}
        </button>
        <Dialog.Close
          class={tool}
          aria-label="Close"
          title="Close"
        >
          <X aria-hidden="true" class="size-5" />
        </Dialog.Close>
      </div>
      <div class="mx-auto w-full max-w-[1100px] px-4 py-4 min-[900px]:px-6">
        <div bind:this={host}></div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
