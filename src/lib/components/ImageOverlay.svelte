<script lang="ts">
  import { hex2rgb, rgb2hsl } from "../colors";
  import type { Chord } from "../worker-interface";

  const {
    imgdata,
    song,
    playing,
  }: {
    imgdata: ImageData;
    song: Chord[] | null;
    playing: number | null;
  } = $props();

  function polyArea(points: [number, number][]): number {
    let area = 0;
    for (const [index, [xs, ys]] of points.entries()) {
      const [xe, ye] = points[(index + 1) % points.length];
      area += xs * ye - xe * ys;
    }
    return Math.abs(area) / 2;
  }

  // TODO better name with better understanding of chords
  function chordName(chord: Chord): string {
    // trimming can leave a chord with no notes; render a rest instead
    const [first] = chord.notes;
    const rend = first?.replaceAll("b", "♭").replaceAll("#", "♯");
    if (rend === undefined) {
      return "𝄽";
    } else {
      return chord.notes.length > 1 ? `${rend}♪` : rend;
    }
  }

  function noteColor(chord: Chord): string {
    const [, , lightness] = rgb2hsl(hex2rgb(chord.color));
    return lightness < 0.5 ? "white" : "black";
  }

  const fontSize = $derived.by(() => {
    let avgSize = 0;
    for (const [index, chord] of (song ?? []).entries()) {
      const width = Math.sqrt(polyArea(chord.poly));
      avgSize += (width - avgSize) / (index + 1);
    }
    return avgSize / 4;
  });
</script>

<svg
  aria-hidden="true"
  viewBox="0 0 {imgdata.width} {imgdata.height}"
  class="absolute h-full w-full"
>
  {#each song ?? [] as chord, index (chord.id)}
    {@const points = chord.poly.map(([x, y]) => `${x},${y}`).join(" ")}
    {@const [cx, cy] = chord.center}
    <g>
      <polygon
        {points}
        vector-effect="non-scaling-stroke"
        class="fill-none stroke-black/10 stroke-1 transition-all"
      />
      <g
        class="{index === playing
          ? 'opacity-100'
          : 'opacity-0'} transition hover:opacity-100"
      >
        <polygon
          {points}
          vector-effect="non-scaling-stroke"
          class="stroke-black/10 stroke-1"
          style:fill={chord.color}
        />
        <!-- TODO make sure this font renders flats -->
        <text
          x={cx}
          y={cy}
          text-anchor="middle"
          dominant-baseline="middle"
          font-size={fontSize}
          fill={noteColor(chord)}
        >
          {chordName(chord)}
        </text>
      </g>
    </g>
  {/each}
</svg>
