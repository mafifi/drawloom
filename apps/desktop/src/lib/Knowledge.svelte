<script lang="ts">
  import { onMount } from 'svelte';
  import KnowledgeView from './KnowledgeView.svelte';
  import { createKnowledgeViewModel } from './knowledge-view-model.svelte.js';
  const vm = createKnowledgeViewModel();
  onMount(() => { void vm.open(); const timer = setInterval(() => void vm.actions.refresh(), 2500); return () => { clearInterval(timer); vm.close(); }; });
</script>
<KnowledgeView presentation={vm.presentation} actions={vm.actions} />
