<script lang="ts" generics="Value extends string">
  import { RadioGroup } from "bits-ui";
  import type { Component } from "svelte";

  let {
    value = $bindable(),
    values,
    label,
    labelledby,
    tall = false,
    onchange,
  }: {
    value: Value;
    // each choice with its caption and, optionally, an icon
    values: [
      Value,
      string,
      Component<{ class?: string; "aria-hidden"?: "true" }>?,
    ][];
    label?: string;
    labelledby?: string;
    // main-panel groups are a little taller than the ones in fine tuning
    tall?: boolean;
    onchange?: (value: Value) => void;
  } = $props();

  // four choices make two rows of two; fewer sit side by side
  const stacked = $derived(values.length > 3);

  let root = $state<HTMLElement | null>(null);
  // where the highlight sits: over the chosen button, sliding when it changes
  let box = $state<{ left: number; top: number; width: number; height: number }>();
  // the first placement should not slide in from the corner
  let placed = $state(false);

  function measure(): void {
    const chosen = root?.querySelectorAll<HTMLElement>("[role=radio]")[
      values.findIndex(([key]) => key === value)
    ];
    if (chosen) {
      box = {
        left: chosen.offsetLeft,
        top: chosen.offsetTop,
        width: chosen.offsetWidth,
        height: chosen.offsetHeight,
      };
    }
  }

  $effect(() => {
    measure();
    if (root) {
      const sized = new ResizeObserver(measure);
      sized.observe(root);
      const settle = requestAnimationFrame(() => {
        placed = true;
      });
      return () => {
        sized.disconnect();
        cancelAnimationFrame(settle);
      };
    }
  });
</script>

<RadioGroup.Root
  bind:ref={root}
  {value}
  onValueChange={(next) => {
    value = next as Value;
    onchange?.(value);
  }}
  aria-label={label}
  aria-labelledby={labelledby}
  class="relative col-span-full grid gap-1 bg-wall p-1 {stacked
    ? 'grid-cols-2 rounded-[22px]'
    : 'auto-cols-fr grid-flow-col rounded-full'}"
>
  {#if box}
    <span
      class="pointer-events-none absolute rounded-full bg-accent motion-reduce:transition-none {placed
        ? 'transition-all duration-200 ease-out'
        : ''}"
      style:left="{box.left}px"
      style:top="{box.top}px"
      style:width="{box.width}px"
      style:height="{box.height}px"
    ></span>
  {/if}
  {#each values as [key, name, Icon] (key)}
    <RadioGroup.Item
      value={key}
      class="relative flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 font-semibold whitespace-nowrap text-muted transition-colors duration-200 hover:text-ink active:scale-[0.97] data-[state=checked]:text-accent-ink motion-reduce:transition-none {tall
        ? 'h-9 text-[13px]'
        : 'h-[30px] text-[12.5px]'}"
    >
      {#if Icon}
        <Icon aria-hidden="true" class="size-4" />
      {/if}
      {name}
    </RadioGroup.Item>
  {/each}
</RadioGroup.Root>
