<script lang="ts">
  import { onMount } from 'svelte';
  import KnowledgeView from './KnowledgeView.svelte';
  import { createKnowledgeViewModel } from './knowledge-view-model.svelte.js';
  const vm = createKnowledgeViewModel();
  let { projects = [] }: { projects?: {id:string; name:string}[] } = $props();
  const presentation = $derived({...vm.presentation, sourceName: projects.find(project=>project.id===vm.presentation.status?.source?.projectId)?.name});
  onMount(() => { void vm.open(); const timer = setInterval(() => void vm.actions.refresh(), 2500); return () => { clearInterval(timer); vm.close(); }; });
</script>
<KnowledgeView {presentation} actions={vm.actions} />
