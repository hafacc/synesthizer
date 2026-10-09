<script lang="ts">
  import { ModeWatcher } from "mode-watcher";
  import type { Snippet } from "svelte";
  import "@fontsource-variable/hanken-grotesk";
  import "../app.css";

  const { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>Synesthizer</title>
  <meta
    name="description"
    content="A synesthetic synthesizer that turns images into piano compositions."
  />
  <meta name="application-name" content="Synesthizer" />
</svelte:head>

<!-- "theme" is the key next-themes stored the choice under -->
<ModeWatcher
  modeStorageKey="theme"
  themeColors={{ light: "#f4f4f2", dark: "#17181b" }}
/>
{@render children()}
