<script lang="ts">
  import { ModeWatcher } from "mode-watcher";
  import type { Snippet } from "svelte";
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
  themeColors={{ light: "#ffffff", dark: "#030712" }}
/>
{@render children()}
