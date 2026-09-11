<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Alert, Button, toast } from '@drawloom/ui';
  import type { RegisteredWorkbenchView } from '@drawloom/plugins';
  import { isMountedMediaPolicyOutdated, samePluginViewGeneration, type PluginViewGeneration } from './media-ui.js';
  import PluginViewFrame from './PluginViewFrame.svelte';

  let { view, conversationId, mediaRevision }: { view: RegisteredWorkbenchView; conversationId: string; mediaRevision: string } = $props();
  let generation = $state(0);
  let mountedRevision = $state('');
  let notificationKey = '';
  let notificationId: string | number | undefined;
  let live = true;
  const outdated = $derived(isMountedMediaPolicyOutdated(mountedRevision, mediaRevision));
  const currentGeneration = (): PluginViewGeneration => ({ conversationId, viewId: view.id, generation });

  function reopen(captured?: PluginViewGeneration) {
    if (!live || captured && !samePluginViewGeneration(captured, currentGeneration())) return;
    mountedRevision = '';
    generation += 1;
  }

  $effect(() => {
    if (!outdated) {
      if (notificationId !== undefined) toast.dismiss(notificationId);
      notificationId = undefined;
      notificationKey = '';
      return;
    }
    const captured = currentGeneration();
    const nextKey = [captured.conversationId, captured.viewId, captured.generation, mountedRevision, mediaRevision].join(':');
    if (notificationKey === nextKey) return;
    if (notificationId !== undefined) toast.dismiss(notificationId);
    notificationKey = nextKey;
    notificationId = toast('Shared media sources changed', {
      description: 'Reopen the workbench to apply them. Reopening discards unsaved UI edits.',
      action: { label: 'Reopen', onClick: () => { if (live && outdated) reopen(captured); } },
    });
  });

  onDestroy(() => {
    live = false;
    if (notificationId !== undefined) toast.dismiss(notificationId);
  });
</script>

{#if outdated}
  <Alert.Root>
    <Alert.Description class="flex flex-wrap items-center justify-between gap-2">
      <span>Shared media sources changed. Reopening applies them and discards unsaved UI edits.</span>
      <Button variant="outline" size="sm" onclick={() => reopen()}>Reopen workbench</Button>
    </Alert.Description>
  </Alert.Root>
{/if}
{#key generation}
  <PluginViewFrame {view} {conversationId} {generation} onmounted={(revision, mountedGeneration) => { if (mountedGeneration === generation) mountedRevision = revision; }} />
{/key}
