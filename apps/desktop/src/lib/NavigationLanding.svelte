<script lang="ts">
  import { Alert, Button, Select, StatefulButton, FolderIcon, ChatIcon, PlugIcon, ChevronRightIcon, Collapsible, Empty } from '@drawloom/ui';
  export type LandingConversation = { id: string; title: string };
  export type LandingWorkbench = { id: string; title: string; description: string };
  export interface NavigationLandingPresentation {
    mode: 'project' | 'workbench'; project?: { id: string; name: string; directory: string; available: boolean };
    workbench?: LandingWorkbench; workbenches: LandingWorkbench[]; recent: LandingConversation[]; existing: LandingConversation[];
    busy: boolean; pendingConversationId?: string; creating: boolean; readiness?: 'ready' | 'configuration_required' | 'unavailable';
  }
  export interface NavigationLandingActions {
    openActivity(): void; openProjects(): void; openWorkbench(id: string): void;
    openConversation(id: string): void; create(workbenchId: string, provider: 'synthetic' | 'codex'): void;
  }
  let { presentation, actions }: { presentation: NavigationLandingPresentation; actions: NavigationLandingActions } = $props();
  let provider = $state('');
</script>

<section class="primary-view-content preview navigation-landing">
  {#if presentation.mode === 'project'}
    {#if presentation.project}
      <div class="screen-intro"><p class="text-muted-foreground">Pick up a conversation or choose a workbench to start something new.</p>
      {#if !presentation.project.available}<Alert.Root><Alert.Description>This folder is unavailable. You can still read saved conversations.</Alert.Description></Alert.Root>{/if}
      <Collapsible.Root><Collapsible.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="sm"><FolderIcon class="size-4" /> Project folder <ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger><Collapsible.Content class="py-3"><p class="break-all text-sm text-muted-foreground">{presentation.project.directory}</p></Collapsible.Content></Collapsible.Root></div>
      <section class="landing-section"><h3>Start with a workbench</h3><div class="landing-list">{#each presentation.workbenches as workbench}<Button class="collection-row" variant="ghost" onclick={() => actions.openWorkbench(workbench.id)}><PlugIcon class="size-5 shrink-0 text-muted-foreground" /><span class="min-w-0 flex-1 text-left">{workbench.title}<span class="block text-sm font-normal text-muted-foreground">{workbench.description}</span></span><ChevronRightIcon class="size-4 shrink-0" /></Button>{/each}</div></section>
      <section class="landing-section"><h3>Recent conversations</h3>
      {#if presentation.recent.length}<div class="landing-list">{#each presentation.recent as conversation}<StatefulButton class="collection-row" variant="ghost" pending={presentation.pendingConversationId === conversation.id} disabled={presentation.busy} onclick={() => actions.openConversation(conversation.id)}><ChatIcon class="size-4 shrink-0 text-muted-foreground" /><span class="truncate">{conversation.title}</span></StatefulButton>{/each}</div>{:else}<p class="text-muted-foreground">Your conversations will appear here.</p>{/if}</section>
    {:else}<h2>Select a project</h2><p class="text-muted-foreground">Choose a project to see its folder, workbenches, conversations, and activity.</p>{/if}
  {:else if presentation.workbench}
    <div class="screen-intro"><p class="text-sm text-muted-foreground">{presentation.project?.name ?? 'No project selected'}</p><h2>{presentation.workbench.title}</h2><p>{presentation.workbench.description}</p>
    {#if presentation.readiness === 'configuration_required' || presentation.readiness === 'unavailable'}<p class="text-muted-foreground">Open an existing conversation to review this workbench’s setup.</p>{/if}
    </div><section class="landing-section"><h3>Existing conversations</h3>{#if presentation.existing.length}<div class="landing-list">{#each presentation.existing as conversation}<StatefulButton class="landing-row h-auto justify-start whitespace-normal rounded-none" variant="ghost" pending={presentation.pendingConversationId === conversation.id} disabled={presentation.busy} onclick={() => actions.openConversation(conversation.id)}>{conversation.title}</StatefulButton>{/each}</div>{:else}<p class="text-muted-foreground">No active conversations use this workbench in the selected project.</p>{/if}</section>
    <section class="landing-section">
    <h3>Start a conversation</h3>
    {#if !presentation.project}<Alert.Root><Alert.Description>Select a project before starting a conversation.</Alert.Description></Alert.Root>{/if}
    <Select.Root type="single" bind:value={provider}><Select.Trigger aria-label="Conversation provider">{provider === 'synthetic' ? 'Synthetic provider' : provider === 'codex' ? 'Codex' : 'Select a provider'}</Select.Trigger><Select.Content><Select.Item value="synthetic" label="Synthetic provider" /><Select.Item value="codex" label="Codex" /></Select.Content></Select.Root>
    <StatefulButton class="w-fit" disabled={presentation.busy || !presentation.project?.available || !provider} pending={presentation.creating} pendingLabel="Creating conversation" onclick={() => actions.create(presentation.workbench!.id, provider as 'synthetic' | 'codex')}>New conversation</StatefulButton>
    </section>
  {:else}<h2>Select a workbench</h2><p class="text-muted-foreground">Choose a workbench from navigation. No conversation will be created until you ask.</p>{/if}
</section>
