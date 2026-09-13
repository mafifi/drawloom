<script lang="ts">
  import { onMount } from "svelte";
  import { EvaluationWorkbench } from "@drawloom/ui";
  import type { EvaluationViewModel } from "@drawloom/evaluation-presentation";

  let { viewModel }: { viewModel: EvaluationViewModel } = $props();
  let revision = $state(0);
  let presentation = $derived.by(() => {
    revision;
    return { ...viewModel.presentation };
  });

  onMount(() => {
    const unsubscribe = viewModel.subscribe(() => { revision += 1; });
    void viewModel.open();
    return () => { unsubscribe(); viewModel.close(); };
  });
</script>

<main class="mx-auto min-h-full max-w-6xl p-4 sm:p-6">
  <EvaluationWorkbench {presentation} actions={viewModel.actions} />
</main>
