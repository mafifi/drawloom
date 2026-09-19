<script lang="ts">
  import { Alert, Attachment, Badge, Button, Collapsible, DocumentIcon, StatefulButton } from '@drawloom/ui';
  import type { ResourceCardActions, ResourceCardPresentation } from './resource-card.js';
  let { presentation, actions }: { presentation: ResourceCardPresentation; actions: ResourceCardActions } = $props();
  const resource = $derived(presentation.resource);
</script>

<section class="flex w-full min-w-0 max-w-full flex-col gap-2 py-3" aria-label={resource.title || 'Resource'}>
  <Attachment.Root class="w-full"><Attachment.Media><DocumentIcon /></Attachment.Media><Attachment.Content><Attachment.Title>{resource.title || 'Resource'}</Attachment.Title><Attachment.Description>{resource.source}{resource.mimeType ? ` · ${resource.mimeType}` : ''}</Attachment.Description></Attachment.Content><Badge variant="outline">{presentation.isWorkingFile ? 'working file' : resource.status}</Badge></Attachment.Root>
  {#if resource.uri}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Source reference</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="break-all text-sm text-muted-foreground">{resource.uri}</p></Collapsible.Content></Collapsible.Root>{/if}
  {#if presentation.canOpen}<Button variant="outline" size="sm" onclick={actions.openWorkspace}>Open in workspace</Button>{/if}
  {#if presentation.isWorkingFile}<p class="text-sm text-muted-foreground">Current project file; viewing does not import it or make it model context.</p>{/if}
  {#if resource.status === 'readable'}<StatefulButton variant="outline" size="sm" pending={presentation.pending} pendingLabel="Reading resource" onclick={actions.read}>Read resource</StatefulButton>{/if}
  {#if resource.status === 'ready' && resource.asset?.mediaType.startsWith('text/')}<Button variant="outline" size="sm" aria-pressed={presentation.selectedForContext} onclick={actions.toggleContext}>{presentation.selectedForContext ? 'Remove from context' : 'Use as context'}</Button>{/if}
  {#if resource.status === 'unavailable' && !presentation.canOpen}<p class="text-sm text-muted-foreground">This source cannot provide the resource here. Its reference is retained.</p>{/if}
  {#if presentation.error}<Alert.Root variant="destructive"><Alert.Description>{presentation.error}</Alert.Description></Alert.Root>{/if}
</section>
