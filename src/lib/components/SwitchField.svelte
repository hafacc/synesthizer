<script lang="ts">
  import { Switch } from "bits-ui";

  let {
    title,
    checked = $bindable(),
  }: {
    title: string;
    checked: boolean;
  } = $props();
</script>

<label
  class="flex h-[38px] min-w-0 cursor-pointer items-center justify-between gap-2 self-end text-[13px] leading-tight font-semibold text-muted"
>
  {title}
  <Switch.Root
    bind:checked
    class="h-5 w-[34px] flex-none rounded-full bg-line transition-colors data-[state=checked]:bg-accent motion-reduce:transition-none"
  >
    <Switch.Thumb
      class="block size-3.5 translate-x-[3px] rounded-full bg-raised transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-accent-ink motion-reduce:transition-none"
    />
  </Switch.Root>
</label>
