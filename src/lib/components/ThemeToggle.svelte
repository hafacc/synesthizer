<script lang="ts">
  import Contrast from "@lucide/svelte/icons/contrast";
  import Moon from "@lucide/svelte/icons/moon";
  import Sun from "@lucide/svelte/icons/sun";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { onMount } from "svelte";

  const cycle = ["light", "dark", "system"] as const;
  type Theme = (typeof cycle)[number];

  const view: Record<Theme, { Icon: typeof Sun; label: string; next: string }> =
    {
      light: { Icon: Sun, label: "Light theme", next: "Switch to dark theme" },
      dark: { Icon: Moon, label: "Dark theme", next: "Switch to system theme" },
      system: {
        Icon: Contrast,
        label: "System theme",
        next: "Switch to light theme",
      },
    };

  // theme is only known on the client, so render a stable fallback until mounted
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  const current = $derived<Theme>(mounted ? userPrefersMode.current : "system");
  const { Icon, label, next } = $derived(view[current]);
</script>

<button
  type="button"
  onclick={() => setMode(cycle[(cycle.indexOf(current) + 1) % cycle.length])}
  title={next}
  aria-label="{label}. {next}"
  class="rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
>
  <Icon aria-hidden="true" class="h-5 w-5" />
</button>
