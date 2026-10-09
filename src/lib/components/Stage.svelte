<script lang="ts">
  import Image from "@lucide/svelte/icons/image";
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import X from "@lucide/svelte/icons/x";
  import { hex2rgb, rgb2hsl } from "../colors";
  import { spell } from "../notes";
  import type { Chord } from "../worker-interface";

  const {
    image,
    imgdata,
    song,
    playing,
    shown,
    showPath,
    dragging,
    error,
    onUpload,
    onRemove,
    onSeek,
  }: {
    image: string | null;
    imgdata: ImageData | null;
    song: Chord[] | null;
    playing: number | null;
    // index of the region under the cursor, playing or not
    shown: number | null;
    // whether to draw the line the playback order follows
    showPath: boolean;
    dragging: boolean;
    error: string | null;
    onUpload: () => void;
    onRemove: () => void;
    onSeek: (index: number) => void;
  } = $props();

  function polyArea(points: [number, number][]): number {
    let area = 0;
    for (const [index, [xs, ys]] of points.entries()) {
      const [xe, ye] = points[(index + 1) % points.length];
      area += xs * ye - xe * ys;
    }
    return Math.abs(area) / 2;
  }

  function label(chord: Chord): string {
    const [first] = chord.notes;
    // trimming can leave a chord with no notes; show a rest instead
    return first === undefined ? "–" : spell(first, chord.sharps);
  }

  // the regions just played fade out behind the current one
  function trail(index: number): string {
    if (playing === null) {
      return index === shown ? "cell on" : "cell";
    } else if (index === playing) {
      return "cell on";
    } else if (index === playing - 1) {
      return "cell t1";
    } else if (index === playing - 2) {
      return "cell t2";
    } else {
      return "cell";
    }
  }

  const tool =
    "grid size-[34px] place-items-center rounded-full bg-surface text-ink hover:bg-raised transition duration-150 active:scale-[0.97] motion-reduce:transition-none";

  // largest first, so a region that surrounds another does not cover it
  const drawn = $derived(
    (song ?? [])
      .map((chord, index): [Chord, number] => [chord, index])
      .sort(([first], [second]) => polyArea(second.poly) - polyArea(first.poly)),
  );

  const current = $derived(
    song !== null && shown !== null ? (song[shown] ?? null) : null,
  );
  // label height as a share of the picture's width: from the region's area,
  // but never more than a thin region has room for
  const labelSize = $derived.by(() => {
    if (current === null || imgdata === null) {
      return 0;
    } else {
      const xs = current.poly.map(([x]) => x);
      const ys = current.poly.map(([, y]) => y);
      const size = Math.min(
        Math.sqrt(polyArea(current.poly)) * 0.34,
        (Math.max(...xs) - Math.min(...xs)) * 0.3,
        (Math.max(...ys) - Math.min(...ys)) * 0.6,
      );
      return (size / imgdata.width) * 100;
    }
  });
  const ink = $derived.by(() => {
    if (current === null) {
      return "#ffffff";
    } else {
      const [, , lightness] = rgb2hsl(hex2rgb(current.color));
      return lightness < 0.5 ? "#ffffff" : "#1b1d22";
    }
  });
</script>

<section
  class="relative grid h-[clamp(240px,56vh,520px)] min-w-0 place-items-center rounded-md bg-mat p-3.5 [container-type:size] min-[900px]:col-start-1 min-[900px]:h-[clamp(300px,calc(100vh-216px),760px)] min-[900px]:p-[22px]"
  aria-label="Picture"
>
  {#if image && imgdata}
    <!-- as large as fits the stage both ways while keeping the picture's shape -->
    <div
      class="@container relative aspect-(--ratio) w-[min(100cqw,calc(100cqh*var(--ratio)))] shadow-[0_1px_0_rgb(0_0_0/0.25),0_18px_40px_-18px_rgb(9_10_36/0.55)]"
      style:--ratio={imgdata.width / imgdata.height}
    >
      <img class="block size-full" src={image} alt="uploaded synth" />
      <svg
        class="absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
        viewBox="0 0 {imgdata.width} {imgdata.height}"
      >
        {#each drawn as [chord, index] (chord.id)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <polygon
            points={chord.poly.map(([x, y]) => `${x},${y}`).join(" ")}
            class={trail(index)}
            style:fill={chord.color}
            onclick={() => onSeek(index)}
          >
            <title>
              {[...chord.notes, ...chord.soft]
                .map((name) => spell(name, chord.sharps))
                .join(" ")}
            </title>
          </polygon>
        {/each}
        {#if showPath && song}
          <polyline
            points={song.map(({ center: [x, y] }) => `${x},${y}`).join(" ")}
            class="pointer-events-none fill-none stroke-white [paint-order:stroke] [stroke-linejoin:round] [stroke-width:2.5] [vector-effect:non-scaling-stroke]"
          />
          {#each [song[0], song[song.length - 1]] as end, index (index)}
            {#if end}
              <circle
                cx={end.center[0]}
                cy={end.center[1]}
                r={2.5}
                class="pointer-events-none fill-white [vector-effect:non-scaling-stroke]"
              />
            {/if}
          {/each}
        {/if}
        {#if current}
          <!-- drawn again last so its outline sits above its neighbors -->
          <polygon
            points={current.poly.map(([x, y]) => `${x},${y}`).join(" ")}
            class="cell on"
            style:fill={current.color}
            style:pointer-events="none"
          />
        {/if}
      </svg>
      {#if current}
        {@const [centerX, centerY] = current.center}
        <div
          class="pointer-events-none absolute -translate-1/2 font-note leading-none font-bold whitespace-nowrap [paint-order:stroke_fill]"
          style:left="{(centerX / imgdata.width) * 100}%"
          style:top="{(centerY / imgdata.height) * 100}%"
          style:font-size="max(13px, {labelSize}cqw)"
          style:color={ink}
          style:-webkit-text-stroke="0.3em {current.color}"
        >
          {label(current)}
        </div>
      {/if}
    </div>
    <div class="absolute top-2 right-2 flex gap-1.5">
      <button
        class={tool}
        type="button"
        onclick={onUpload}
        aria-label="Replace picture"
        title="Replace picture"
      >
        <ImagePlus aria-hidden="true" class="size-[18px]" />
      </button>
      <button
        class={tool}
        type="button"
        onclick={onRemove}
        aria-label="Remove picture"
        title="Remove picture"
      >
        <X aria-hidden="true" class="size-[18px]" />
      </button>
    </div>
  {:else if !image}
    <div class="flex w-full flex-col items-center gap-3 px-3 py-2 text-center">
      <Image aria-hidden="true" class="size-13 text-accent" strokeWidth={1.4} />
      <h2
        class="text-[clamp(24px,4vw,34px)] leading-[1.1] font-bold tracking-[-0.015em] text-balance"
      >
        Drop a picture here
      </h2>
      <p class="max-w-[40ch] text-balance text-muted">
        Its colors become a piano piece, played one region at a time.
      </p>
      {#if error}
        <p class="font-semibold text-signal" role="alert">{error}</p>
      {/if}
      <button
        class="inline-flex h-12 items-center justify-center rounded-full bg-accent px-[22px] text-base font-semibold text-accent-ink hover:brightness-110 transition duration-150 active:scale-[0.97] motion-reduce:transition-none"
        type="button"
        onclick={onUpload}
      >
        Choose a picture
      </button>
    </div>
  {/if}
  {#if dragging}
    <div
      class="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-md bg-accent text-[clamp(22px,3.5vw,32px)] font-bold text-accent-ink"
    >
      Drop to play this picture
    </div>
  {/if}
</section>
