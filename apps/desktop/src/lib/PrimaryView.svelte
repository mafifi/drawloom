<script lang="ts">
  import { ChevronRightIcon, Sidebar, Button, Checkbox, Field, Input, Separator, StatefulButton, toast } from '@drawloom/ui';
  import { settingsSections, pluginSettingsTitle } from './settings-navigation.js';
  import DiscoveryInventory from './DiscoveryInventory.svelte';
  import PluginSettingsFrame from './PluginSettingsFrame.svelte';
  import BrowserSettingsView from './BrowserSettingsView.svelte';
  import Projects from './Projects.svelte';
  import Knowledge from './Knowledge.svelte';
  import CodexModelSelector from './CodexModelSelector.svelte';
  import WorkflowRuns from './WorkflowRuns.svelte';
  import NavigationLanding from './NavigationLanding.svelte';
  import ProjectActivitySummary from './ProjectActivitySummary.svelte';
  import ArchivedConversations from './ArchivedConversations.svelte';
  import { archiveCopy } from './screen-language.js';
  import { createOrchestrationViewModel } from './orchestration-view-model.svelte.js';
  import type { PrimaryViewActions, PrimaryViewPresentation } from './primary-view.js';
  let { presentation, actions }: { presentation: PrimaryViewPresentation; actions: PrimaryViewActions } = $props();
  const activitySummary = createOrchestrationViewModel();
  let activityProjectId = '';
  $effect(() => {
    const nextProjectId = presentation.primaryView === 'project' ? presentation.selectedProject?.id ?? '' : '';
    if (nextProjectId === activityProjectId) return;
    activityProjectId = nextProjectId;
    if (nextProjectId) void activitySummary.openSummary(nextProjectId); else activitySummary.close();
  });
  const activityPresentation = $derived({ loading:activitySummary.loading, error:activitySummary.error, items:activitySummary.summaryRuns.map(({ownerTitle,run}) => ({id:run.runId,owner:ownerTitle,workflow:run.workflow,status:run.cancellationRequested?'cancellation requested':run.status})) });
  const landingPresentation = $derived.by(() => {
    const project = presentation.selectedProject, workbench = presentation.selectedWorkbench, conversation = presentation.conversation;
    const activeConversations = presentation.conversations.filter(c => !c.archived && c.projectId === project?.id);
    return {
      mode: presentation.primaryView as 'project' | 'workbench',
      project: project ? { id: project.id, name: project.name, directory: project.directory, available: project.available } : undefined,
      workbench: workbench ? { id: workbench.id, title: workbench.title, description: workbench.description } : undefined,
      workbenches: presentation.workbenches.map(({ id, title, description }) => ({ id, title, description })),
      recent: activeConversations.slice(-5).reverse().map(({ id, title }) => ({ id, title })),
      existing: activeConversations.filter(c => c.workbenchId === workbench?.id).map(({ id, title }) => ({ id, title })),
      busy: presentation.busy,
      pendingConversationId: presentation.pendingCommand?.kind === 'select_conversation' ? presentation.pendingCommand.conversationId : undefined,
      creating: presentation.creationSource === 'workbench',
      readiness: presentation.selectedWorkbenchReadiness,
    };
  });
  const landingActions = { openActivity:()=>actions.setPrimaryView('activity'), openProjects:()=>actions.setPrimaryView('projects'), openWorkbench:(id:string)=>actions.openWorkbench(id), openConversation:(id:string)=>void actions.selectConversation(id), create:(workbenchId:string,provider:'synthetic'|'codex')=>void actions.createConversation(workbenchId,provider) };
  const projectPresentation = $derived({busy:presentation.busy, choosing:presentation.projectDirectoryPending, saving:presentation.pendingCommand?.kind==='add_project', note:presentation.projectDirectoryNote, error:presentation.error});
  const projectActions = {chooseDirectory:()=>actions.chooseProjectDirectory(), add:async(directory:string,name:string)=>{const saved=await actions.addProject(directory,name); if(saved) actions.setPrimaryView('project'); return saved;}, cancel:()=>{actions.setPrimaryView(presentation.selectedProject?'project':'conversation');}};
  const archivePresentation=$derived({copy:archiveCopy,rows:presentation.conversations.filter(c=>c.archived).map(c=>({id:c.id,title:c.title,project:presentation.projects.find(p=>p.id===c.projectId)?.name??'Unassigned project',workbench:presentation.workbenches.find(w=>w.id===c.workbenchId)?.title??'Workbench'})),pendingId:presentation.pendingCommand?.kind==='restore_conversation'?presentation.pendingCommand.conversationId:undefined,busy:presentation.busy,error:presentation.error});
  async function restoreConversation(id: string) {
    if (await actions.restoreConversation(id)) toast.success('Conversation restored');
  }
</script>

<main class="primary-view">
  <header class="primary-view-header">
    <Sidebar.Trigger class="primary-navigation-trigger" aria-label={presentation.primaryView === 'settings' ? 'Settings navigation' : 'Toggle navigation'} />
    <h1 class="min-w-0 flex-1">{presentation.primaryView === 'plugins' ? 'Plugins' : presentation.primaryView === 'projects' ? 'Projects' : presentation.primaryView === 'project' ? (presentation.selectedProject?.name ?? 'Project') : presentation.primaryView === 'workbench' ? (presentation.selectedWorkbench?.title ?? 'Workbench') : presentation.primaryView === 'activity' ? 'Activity' : presentation.primaryView === 'archived' ? 'Archived conversations' : presentation.primaryView === 'knowledge' ? 'Knowledge' : presentation.selectedSettingsPage ? pluginSettingsTitle(presentation.selectedSettingsPage) : (settingsSections.find(s => s.id === presentation.settingsSection)?.title ?? 'Settings')}</h1>
    {#if presentation.primaryView !== 'settings'}<Button variant="ghost" aria-label="← Back to conversation" onclick={() => actions.setPrimaryView('conversation')}><ChevronRightIcon class="size-4 rotate-180" /><span class="hidden sm:inline">Back to conversation</span></Button>{/if}
  </header>
  <Separator />
  <div class="primary-view-scroll scroll-fade scroll-fade-4">
  {#if presentation.primaryView === 'plugins'}
    <div class="primary-view-content"><DiscoveryInventory presentation={presentation.discoveryInventory} actions={actions.discoveryInventory} /></div>
  {:else if presentation.primaryView === 'projects'}
    <Projects presentation={projectPresentation} actions={projectActions} />
  {:else if presentation.primaryView === 'knowledge'}
    <Knowledge projects={presentation.projects.map(({id,name})=>({id,name}))} />
  {:else if presentation.primaryView === 'project' || presentation.primaryView === 'workbench'}
    <NavigationLanding presentation={landingPresentation} actions={landingActions} />
    {#if presentation.primaryView === 'project'}<div class="primary-view-content preview"><ProjectActivitySummary presentation={activityPresentation} onopen={() => actions.setPrimaryView('activity')} /></div>{/if}
  {:else if presentation.primaryView === 'activity'}
    <section class="primary-view-content preview"><p class="text-muted-foreground">{presentation.selectedProject ? `Follow project work in ${presentation.selectedProject.name} and knowledge maintenance across all projects.` : 'Follow knowledge maintenance across all projects.'}</p><WorkflowRuns projectId={presentation.selectedProject?.id} /></section>
  {:else if presentation.primaryView === 'archived'}
    <ArchivedConversations presentation={archivePresentation} restore={restoreConversation} />
  {:else}
    <section class="primary-view-content settings-content">
      {#if presentation.settingsSection==='browser'}<BrowserSettingsView presentation={presentation.browser} actions={{forget:(origin,permission)=>actions.browserForget(origin,permission)}}/>{/if}
      {#if presentation.selectedSettingsPage}
        <section class="settings-group">
          {#if presentation.selectedSettingsPage.status === 'available'}
            {#key presentation.settingsSection}<PluginSettingsFrame page={presentation.selectedSettingsPage} />{/key}
          {:else}<p class="text-muted-foreground">{presentation.selectedSettingsPage.status === 'disabled' ? 'Enable this plugin in Integrations to open its settings.' : 'Settings are unavailable. Check the plugin installation and selected servers in Integrations.'}</p>{/if}
        </section>
      {/if}
      {#if presentation.settingsSection === 'general'}
      <section class="settings-group">
      <h2>Local profile</h2><div class="settings-surface"><div class="settings-stack"><p class="text-muted-foreground">Drawloom runs locally. Agent sign-in is managed separately by its provider.</p></div></div></section>
      <section class="settings-group"><h2>Current conversation</h2><div class="settings-surface">
      {#if presentation.conversation?.provider==='codex'}
        <div class="settings-row"><div><h3>Conversation model</h3><p class="text-sm text-muted-foreground">Applies to the next turn in {presentation.conversation.title}.</p></div>
        <div class="w-fit"><CodexModelSelector selection={presentation.conversation.modelSelection} disabled={presentation.busy||Boolean(presentation.activeOperation)} onSelect={selection=>{if(presentation.conversation)void actions.setModel(presentation.conversation.id,selection);}} /></div>
        </div>
      {/if}
      <div class="settings-stack"><h3>Project</h3>
      <p class="break-all text-muted-foreground">{presentation.conversationProject?.directory ?? 'Select a project to use working files.'}</p>
      </div></div></section>
      <section class="settings-group">
      <h2>Knowledge</h2>
      <div class="settings-surface"><div class="settings-row">
      <p class="text-muted-foreground">Search what you’ve learned and manage how knowledge stays up to date.</p>
      <Button variant="outline" class="w-fit" onclick={() => actions.setPrimaryView('knowledge')}>Open Knowledge</Button>
      </div></div></section>
      {/if}
      {#if presentation.settingsSection === 'media'}
      <section class="settings-group">
      <h2>Shared media sources</h2>
      <p class="text-muted-foreground">Media from these locations can be displayed across your workbenches. Viewing it does not send it to a model.</p>
      {#if presentation.mediaSources.length}
        <dl class="flex flex-col gap-3">
          {#each presentation.mediaSources as source}
            <div><dt class="break-all">{source.origin}</dt><dd class="text-sm text-muted-foreground">Declared by {source.sources.join(', ')}</dd></div>
          {/each}
        </dl>
      {:else}
        <p class="text-muted-foreground">No shared remote media sources are active.</p>
      {/if}
      </section>
      {/if}
      {#if presentation.settingsSection === 'workbench'}
      <section class="settings-group">
      <div class="space-y-1">
        <h2>{presentation.workbenches.find(workbench => workbench.id === presentation.conversation?.workbenchId)?.title ?? 'Workbench settings'}</h2>
        <p class="text-sm text-muted-foreground">{presentation.conversationProject ? `Settings for ${presentation.conversationProject.name}.` : 'Open a conversation to manage its workbench settings.'}</p>
      </div>
      {#each presentation.operatorConfiguration as field}
        <form class="settings-row" onsubmit={(event) => {
          event.preventDefault();
          void actions.configureField(field, new FormData(event.currentTarget));
        }}>
          <Field.Label for={'config-' + field.key}>{field.label}</Field.Label>
          <div class="settings-controls">
            {#if typeof field.value === 'boolean'}<Checkbox id={'config-' + field.key} name="value" checked={field.value} disabled={presentation.busy} />{:else}<Input id={'config-' + field.key} name="value" type={typeof field.value === 'number' ? 'number' : 'text'} value={String(field.value)} disabled={presentation.busy} />{/if}
            <StatefulButton type="submit" pending={presentation.pendingCommand?.kind === 'operator' && presentation.pendingCommand.command.kind === 'configure' && presentation.pendingCommand.command.key === field.key} variant="outline" class="w-fit" disabled={presentation.busy}>Save</StatefulButton>
          </div>
        </form>
      {:else}
        {#if presentation.conversation}<p class="text-sm text-muted-foreground">This workbench has no settings to change here.</p>{/if}
      {/each}
      </section>
      {/if}
      {#if presentation.settingsSection === 'permissions'}
      <section class="settings-group">
      <Field.Set><Field.Legend>Allowed tools</Field.Legend><Field.Description>Choose which tools may run. Actions still follow your approval settings.</Field.Description><Field.Group>
        {#each presentation.operatorGrants as grant}
          {@const label = presentation.toolLabels.find(tool => tool.toolName === grant.toolName)}
          <Field.Field orientation="horizontal" data-disabled={presentation.busy}><Checkbox id={'grant-' + grant.toolName} checked={grant.allowed} disabled={presentation.busy} onCheckedChange={(checked) => actions.setToolGrant(grant.toolName, checked)} /><Field.Label for={'grant-' + grant.toolName}>{label ? `${label.title} · ${label.origin}` : grant.toolName}</Field.Label></Field.Field>
        {/each}
      </Field.Group></Field.Set>
      </section>
      {/if}
      {#if presentation.settingsSection === 'integrations'}
      <section class="settings-group">
        <h2>Codex</h2><div class="settings-surface"><div class="settings-stack"><p class="text-muted-foreground">Connect through the Codex app on this Mac. Sign-in and account access are managed there.</p>
        <p class="text-sm text-muted-foreground">Choose a model and effort in your conversation. Switching to another agent is not available yet.</p>
      </div></div></section>
      <section class="settings-group">
      <h2>Plugins</h2><div class="settings-surface"><div class="settings-row"><p class="text-muted-foreground">Inspect installed plugins and configure their connections.</p><Button variant="outline" class="w-fit" onclick={() => actions.setPrimaryView('plugins')}>Open Plugins</Button>
      </div></div></section>
      {/if}
    </section>
  {/if}
  </div>
</main>
