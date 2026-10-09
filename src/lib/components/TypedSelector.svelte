<script lang="ts" generics="Value extends string">
  let {
    title,
    value = $bindable(),
    values,
  }: {
    title: string;
    value: Value;
    values: [Value, string][];
  } = $props();

  const id = $props.id();
</script>

<div>
  <label class="block text-sm font-semibold" for={id}>{title}</label>
  <select
    {id}
    class="mt-0.5 block w-full rounded border border-gray-300 bg-gray-50 p-1.5 outline-violet-600 focus:outline-2 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:disabled:text-gray-500"
    bind:value
  >
    {#each values as [key, name] (key)}
      <option value={key}>{name}</option>
    {/each}
  </select>
</div>
