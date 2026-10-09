<script lang="ts" generics="Value extends string">
  import Segmented from "./Segmented.svelte";

  let {
    title,
    value = $bindable(),
    values,
  }: {
    title: string;
    value: Value;
    values: [Value, string][];
  } = $props();
</script>

<!-- titles of different lengths share a row, so each sits on the bottom of its
  cell and the fields line up; more than two choices need the whole row -->
<div
  class="grid min-w-0 grid-rows-[1fr_auto] items-end gap-[5px] {values.length >
  2
    ? 'col-span-full'
    : ''}"
>
  <span class="text-[13px] leading-tight font-semibold text-muted">{title}</span>
  <Segmented bind:value {values} label={title} />
</div>
