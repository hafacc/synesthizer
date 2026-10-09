<script lang="ts">
  import Contrast from "@lucide/svelte/icons/contrast";
  import Moon from "@lucide/svelte/icons/moon";
  import Sun from "@lucide/svelte/icons/sun";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { onMount } from "svelte";

  const cycle = ["system", "light", "dark"] as const;
  type Theme = (typeof cycle)[number];

  const view: Record<Theme, { Icon: typeof Sun; name: string; next: string }> =
    {
      system: { Icon: Contrast, name: "System", next: "light" },
      light: { Icon: Sun, name: "Light", next: "dark" },
      dark: { Icon: Moon, name: "Dark", next: "system" },
    };

  // theme is only known on the client, so render a stable fallback until mounted
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  const current = $derived<Theme>(mounted ? userPrefersMode.current : "system");
  const { Icon, name, next } = $derived(view[current]);
</script>

<button
  class="grid size-10 place-items-center rounded-full border-[1.5px] border-line hover:border-ink transition duration-150 active:scale-[0.97] motion-reduce:transition-none"
  type="button"
  onclick={() => setMode(cycle[(cycle.indexOf(current) + 1) % cycle.length])}
  title="{name} theme. Switch to {next} theme"
  aria-label="{name} theme. Switch to {next} theme"
>
  <Icon aria-hidden="true" class="size-5" />
</button>
