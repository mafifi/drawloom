<script lang="ts">
  import { onMount } from 'svelte';
  import KnowledgeView from './KnowledgeView.svelte';
  import LocalKnowledgeSetupView from './LocalKnowledgeSetupView.svelte';
  import { createLocalKnowledgeSetupViewModel } from './local-knowledge-setup-view-model.svelte.js';
  import { createKnowledgeViewModel } from './knowledge-view-model.svelte.js';
  const vm = createKnowledgeViewModel();
  const local = createLocalKnowledgeSetupViewModel();
  let { projects = [] }: { projects?: {id:string; name:string}[] } = $props();
  const presentation = $derived({...vm.presentation, sourceName: projects.find(project=>project.id===vm.presentation.status?.source?.projectId)?.name});
  onMount(() => { void vm.open(); void local.open(); const timer = setInterval(() => { void vm.actions.refresh(); void local.actions.refresh(); }, 2500); return () => { clearInterval(timer); vm.close(); local.close(); }; });
</script>
{#snippet localSetup()}<LocalKnowledgeSetupView presentation={local.presentation} actions={local.actions} />{/snippet}
<KnowledgeView {presentation} actions={vm.actions} localSetup={local.presentation.status || local.presentation.error ? localSetup : undefined} />
