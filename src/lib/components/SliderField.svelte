<script lang="ts">
  import { Slider } from "bits-ui";

  let {
    title,
    value = $bindable(),
    min = 0,
    max,
    step,
    disabled = false,
  }: {
    title: string;
    value: number;
    min?: number;
    max: number;
    step: number;
    disabled?: boolean;
  } = $props();
</script>

<div class="grid min-w-0 grid-rows-[1fr_auto] items-end gap-[5px]">
  <div
    class="flex items-end justify-between gap-2 text-[13px] leading-tight font-semibold text-muted"
  >
    <span>{title}</span>
    <!-- steps like 0.1 do not add up exactly, so the readout is rounded -->
    <output class="text-ink tabular-nums">{Number(value.toFixed(2))}</output>
  </div>
  <Slider.Root
    type="single"
    bind:value
    {min}
    {max}
    {step}
    {disabled}
    class="relative flex h-[22px] w-full touch-none items-center select-none data-disabled:opacity-45"
  >
    <span class="relative h-1 w-full grow overflow-hidden rounded-full bg-line">
      <Slider.Range class="absolute h-full bg-accent" />
    </span>
    <Slider.Thumb
      index={0}
      aria-label={title}
      class="block size-[18px] cursor-pointer rounded-full bg-accent"
    />
  </Slider.Root>
</div>
