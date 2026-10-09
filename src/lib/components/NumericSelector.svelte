<script lang="ts">
  import { untrack } from "svelte";

  let {
    title,
    value = $bindable(),
    min,
    max,
    step,
    integer = false,
    disabled,
  }: {
    title: string;
    value: number | null;
    min?: number;
    max?: number;
    step?: number;
    integer?: boolean;
    disabled?: boolean;
  } = $props();

  const id = $props.id();
  const initial = untrack(() => value);
  let input: HTMLInputElement;

  // the field keeps whatever was typed; `value` is that number only while it is
  // usable, so a half-typed or out-of-range entry never reaches the conversion
  function parse(typed: number): number | null {
    if (
      Number.isNaN(typed) ||
      (min !== undefined && typed < min) ||
      (max !== undefined && typed > max) ||
      (integer && !Number.isInteger(typed))
    ) {
      return null;
    } else {
      return typed;
    }
  }

  $effect(() => {
    if (value !== null && input.valueAsNumber !== value) {
      input.value = `${value}`;
    }
  });
</script>

<div>
  <label class="block text-sm font-semibold" for={id}>{title}</label>
  <input
    bind:this={input}
    type="number"
    {id}
    {min}
    {max}
    {step}
    {disabled}
    defaultValue={initial ?? undefined}
    aria-invalid={value === null && !disabled}
    oninput={() => {
      value = parse(input.valueAsNumber);
    }}
    class="mt-0.5 block w-full rounded border border-gray-300 bg-gray-50 p-1.5 outline-violet-600 focus:outline-2 disabled:text-gray-400 aria-invalid:border-red-500 dark:border-gray-700 dark:bg-gray-800 dark:disabled:text-gray-500 dark:aria-invalid:border-red-500"
  />
</div>
