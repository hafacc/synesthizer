<script lang="ts">
  import { spell } from "../notes";

  // a note name like "Ab4", spelled for its key; `large` sets the octave small
  // and low beside the letter
  const {
    name,
    sharps,
    large = false,
  }: { name: string; sharps: boolean; large?: boolean } = $props();

  const letters = $derived(spell(name.slice(0, -1), sharps));
  const octave = $derived(name.slice(-1));
</script>

{#if large}
  {letters}<sub
    class="ml-[0.1em] align-baseline text-[0.42em] font-medium tracking-normal text-muted"
    >{octave}</sub
  >
{:else}
  {letters}{octave}
{/if}
