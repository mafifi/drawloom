<script lang="ts">
  import { onMount } from "svelte";
  import InspectionView from "./InspectionView.svelte";
  import { InspectionViewModel, type InspectionClient, type InspectionPresentation } from "./inspection-view-model.ts";

  let { client }: { client: InspectionClient } = $props();
  const vm = new InspectionViewModel({ open: () => client.open(), save: input => client.save(input) });
  let presentation: InspectionPresentation = $state(vm.presentation);
  onMount(() => {
    const unsubscribe = vm.subscribe(() => { presentation = vm.presentation; });
    void vm.load();
    return unsubscribe;
  });
</script>

<InspectionView {presentation} actions={vm.actions} />
