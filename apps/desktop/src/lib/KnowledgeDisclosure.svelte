<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { HistoryEntry } from '@drawloom/conversation-history';
  import KnowledgeDisclosureView from './KnowledgeDisclosureView.svelte';
  import { createKnowledgeViewModel } from './knowledge-view-model.svelte.js';
  import { presentKnowledgeDisclosure } from './knowledge-disclosure.js';
  let { summary }: { summary: HistoryEntry['preparation'] } = $props();
  const vm = createKnowledgeViewModel();
  const presentation = $derived(presentKnowledgeDisclosure(summary));
  const disclosureIdentity = $derived(JSON.stringify(summary));
  $effect(() => { disclosureIdentity; untrack(vm.close); });
  // Creating the disclosure makes no request. Inspection uses the normal,
  // authorized evidence endpoint only after an explicit user action.
  onDestroy(vm.close);
</script>

<KnowledgeDisclosureView {presentation} evidence={vm.presentation} actions={vm.actions} />
