<script lang="ts">
  import { ChevronRightIcon, Sidebar, Button, Checkbox, Field, Input, Separator, StatefulButton, toast } from '@drawloom/ui';
  import { settingsSections } from './settings-navigation.js';
  import DiscoveryInventory from './DiscoveryInventory.svelte';
  import PluginSettingsFrame from './PluginSettingsFrame.svelte';
  import Projects from './Projects.svelte';
  import Knowledge from './Knowledge.svelte';
  import CodexModelSelector from './CodexModelSelector.svelte';
  import WorkflowRuns from './WorkflowRuns.svelte';
  import NavigationLanding from './NavigationLanding.svelte';
  import ProjectActivitySummary from './ProjectActivitySummary.svelte';
  import ArchivedConversations from './ArchivedConversations.svelte';
  import { archiveCopy } from './screen-language.js';
  import { createOrchestrationViewModel } from './orchestration-view-model.svelte.js';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm }: { vm: DesktopViewModel } = $props();
  const activitySummary = createOrchestrationViewModel();
  let activityProjectId = '';
  $effect(() => {
    const nextProjectId = vm.primaryView === 'project' ? vm.selectedProject?.id ?? '' : '';
    if (nextProjectId === activityProjectId) return;
    activityProjectId = nextProjectId;
    if (nextProjectId) void activitySummary.openSummary(nextProjectId); else activitySummary.close();
  });
  const activityPresentation = $derived({ loading:activitySummary.loading, error:activitySummary.error, items:activitySummary.summaryRuns.map(({ownerTitle,run}) => ({id:run.runId,owner:ownerTitle,workflow:run.workflow,status:run.cancellationRequested?'cancellation requested':run.status})) });
  const landingPresentation = $derived.by(() => {
    const project = vm.selectedProject, workbench = vm.selectedWorkbench, conversation = vm.conversation;
    const activeConversations = vm.state?.conversations.filter(c => !c.archived && c.projectId === project?.id) ?? [];
    return {
      mode: vm.primaryView as 'project' | 'workbench',
      project: project ? { id: project.id, name: project.name, directory: project.directory, available: project.available } : undefined,
      workbench: workbench ? { id: workbench.id, title: workbench.title, description: workbench.description } : undefined,
      workbenches: vm.state?.workbenches.map(({ id, title, description }) => ({ id, title, description })) ?? [],
      recent: activeConversations.slice(-5).reverse().map(({ id, title }) => ({ id, title })),
      existing: activeConversations.filter(c => c.workbenchId === workbench?.id).map(({ id, title }) => ({ id, title })),
      busy: vm.busy,
      pendingConversationId: vm.pendingCommand?.kind === 'select_conversation' ? vm.pendingCommand.conversationId : undefined,
      creating: vm.creationSource === 'workbench',
      readiness: vm.selectedWorkbenchReadiness,
    };
  });
  const landingActions = { openActivity:()=>vm.primaryView='activity', openProjects:()=>vm.primaryView='projects', openWorkbench:(id:string)=>vm.openWorkbench(id), openConversation:(id:string)=>void vm.select(id), create:(workbenchId:string,provider:'synthetic'|'codex')=>void vm.create(workbenchId,provider,'workbench') };
  const projectPresentation = $derived({busy:vm.busy, choosing:vm.projectDirectoryPending, saving:vm.pendingCommand?.kind==='add_project', note:vm.projectDirectoryNote, error:vm.error});
  const projectActions = {chooseDirectory:()=>vm.chooseProjectDirectory(), add:async(directory:string,name:string)=>{const saved=await vm.addProject(directory,name); if(saved) vm.primaryView='project'; return saved;}, cancel:()=>{vm.primaryView=vm.selectedProject?'project':'conversation';}};
  const archivePresentation=$derived({copy:archiveCopy,rows:(vm.state?.conversations.filter(c=>c.archived)??[]).map(c=>({id:c.id,title:c.title,project:vm.state?.projects.find(p=>p.id===c.projectId)?.name??'Unassigned project',workbench:vm.state?.workbenches.find(w=>w.id===c.workbenchId)?.title??'Workbench'})),pendingId:vm.pendingCommand?.kind==='restore_conversation'?vm.pendingCommand.conversationId:undefined,busy:vm.busy,error:vm.error});
</script>

<main class="primary-view">
  <header class="primary-view-header">
    <Sidebar.Trigger class="min-[1051px]:hidden" aria-label={vm.primaryView === 'settings' ? 'Settings navigation' : 'Toggle navigation'} />
    <h1 class="min-w-0 flex-1">{vm.primaryView === 'plugins' ? 'Plugins' : vm.primaryView === 'projects' ? 'Projects' : vm.primaryView === 'project' ? (vm.selectedProject?.name ?? 'Project') : vm.primaryView === 'workbench' ? (vm.selectedWorkbench?.title ?? 'Workbench') : vm.primaryView === 'activity' ? 'Activity' : vm.primaryView === 'archived' ? 'Archived conversations' : vm.primaryView === 'knowledge' ? 'Knowledge' : (settingsSections.find(s => s.id === vm.settingsSection)?.title ?? 'Settings')}</h1>
    {#if vm.primaryView !== 'settings'}<Button variant="ghost" aria-label="← Back to conversation" onclick={() => { vm.primaryView = 'conversation'; }}><ChevronRightIcon class="size-4 rotate-180" /><span class="hidden sm:inline">Back to conversation</span></Button>{/if}
  </header>
  <Separator />
  <div class="primary-view-scroll scroll-fade scroll-fade-4">
  {#if vm.primaryView === 'plugins'}
    <div class="primary-view-content"><DiscoveryInventory {vm} /></div>
  {:else if vm.primaryView === 'projects'}
    <Projects presentation={projectPresentation} actions={projectActions} />
  {:else if vm.primaryView === 'knowledge'}
    <Knowledge projects={vm.state?.projects.map(({id,name})=>({id,name}))??[]} />
  {:else if vm.primaryView === 'project' || vm.primaryView === 'workbench'}
    <NavigationLanding presentation={landingPresentation} actions={landingActions} />
    {#if vm.primaryView === 'project'}<div class="primary-view-content preview"><ProjectActivitySummary presentation={activityPresentation} onopen={() => vm.primaryView = 'activity'} /></div>{/if}
  {:else if vm.primaryView === 'activity'}
    <section class="primary-view-content preview"><p class="text-muted-foreground">{vm.selectedProject ? `Follow project work in ${vm.selectedProject.name} and knowledge maintenance across all projects.` : 'Follow knowledge maintenance across all projects.'}</p><WorkflowRuns projectId={vm.selectedProject?.id} /></section>
  {:else if vm.primaryView === 'archived'}
    <ArchivedConversations presentation={archivePresentation} restore={async(id)=>{if(await vm.command({kind:'restore_conversation',conversationId:id}))toast.success('Conversation restored');}} />
  {:else}
    <section class="primary-view-content settings-content">
      {#if vm.selectedSettingsPage}
        <section class="settings-section">
          <h2>{vm.selectedSettingsPage.ownerTitle} · {vm.selectedSettingsPage.title}</h2>
          {#if vm.selectedSettingsPage.status === 'available'}
            {#key vm.settingsSection}<PluginSettingsFrame page={vm.selectedSettingsPage} />{/key}
          {:else}<p class="text-muted-foreground">{vm.selectedSettingsPage.status === 'disabled' ? 'Enable this plugin in Integrations to open its settings.' : 'Settings are unavailable. Check the plugin installation and selected servers in Integrations.'}</p>{/if}
        </section>
      {/if}
      {#if vm.settingsSection === 'general'}
      <section class="settings-section">
      <h2>Local profile</h2><p class="text-muted-foreground">Drawloom runs locally. Agent sign-in is managed separately by its provider.</p>
      {#if vm.conversation?.provider==='codex'}
        <h2>Conversation model</h2><p class="text-sm text-muted-foreground">Applies to the next turn in {vm.conversation.title}.</p>
        <div class="w-fit"><CodexModelSelector selection={vm.conversation.modelSelection} disabled={vm.busy||Boolean(vm.state?.activeOperation)} onSelect={selection=>{if(vm.conversation)void vm.command({kind:'set_model',conversationId:vm.conversation.id,...(selection?{selection}:{})});}} /></div>
      {/if}
      <h2>Project</h2>
      <p class="break-all text-muted-foreground">{vm.conversationProject?.directory ?? 'Select a project to use working files.'}</p>
      </section>
      <section class="settings-section">
      <h2>Knowledge</h2>
      <p class="text-muted-foreground">Search what you’ve learned and manage how knowledge stays up to date.</p>
      <Button variant="outline" class="w-fit" onclick={() => vm.primaryView = 'knowledge'}>Open Knowledge</Button>
      </section>
      {/if}
      {#if vm.settingsSection === 'media'}
      <section class="settings-section">
      <h2>Shared media sources</h2>
      <p class="text-muted-foreground">Media from these locations can be displayed across your workbenches. Viewing it does not send it to a model.</p>
      {#if vm.state?.mediaPolicy.sources.length}
        <dl class="flex flex-col gap-3">
          {#each vm.state.mediaPolicy.sources as source}
            <div><dt class="break-all">{source.origin}</dt><dd class="text-sm text-muted-foreground">Declared by {source.sources.join(', ')}</dd></div>
          {/each}
        </dl>
      {:else}
        <p class="text-muted-foreground">No shared remote media sources are active.</p>
      {/if}
      </section>
      {/if}
      {#if vm.settingsSection === 'workbench'}
      <section class="settings-section">
      <div class="space-y-1">
        <h2>{vm.state?.workbenches.find(workbench => workbench.id === vm.conversation?.workbenchId)?.title ?? 'Workbench settings'}</h2>
        <p class="text-sm text-muted-foreground">{vm.conversationProject ? `Settings for ${vm.conversationProject.name}.` : 'Open a conversation to manage its workbench settings.'}</p>
      </div>
      {#each vm.state?.operator.configuration ?? [] as field}
        <form class="workbench-setting-row" onsubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = typeof field.value === 'boolean' ? data.get('value') === 'on' : typeof field.value === 'number' ? Number(data.get('value')) : String(data.get('value'));
          void vm.operator({ kind: 'configure', key: field.key, value });
        }}>
          <Field.Label for={'config-' + field.key}>{field.label}</Field.Label>
          <div class="workbench-setting-controls">
            {#if typeof field.value === 'boolean'}<Checkbox id={'config-' + field.key} name="value" checked={field.value} disabled={vm.busy} />{:else}<Input id={'config-' + field.key} name="value" type={typeof field.value === 'number' ? 'number' : 'text'} value={String(field.value)} disabled={vm.busy} />{/if}
            <StatefulButton type="submit" pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'configure' && vm.pendingCommand.command.key === field.key} variant="outline" class="w-fit" disabled={vm.busy}>Save</StatefulButton>
          </div>
        </form>
      {:else}
        {#if vm.conversation}<p class="text-sm text-muted-foreground">This workbench has no settings to change here.</p>{/if}
      {/each}
      </section>
      {/if}
      {#if vm.settingsSection === 'permissions'}
      <section class="settings-section">
      <Field.Set><Field.Legend>Allowed tools</Field.Legend><Field.Description>Choose which tools may run. Actions still follow your approval settings.</Field.Description><Field.Group>
        {#each vm.state?.operator.grants ?? [] as grant}
          {@const label = vm.state?.toolLabels.find(tool => tool.toolName === grant.toolName)}
          <Field.Field orientation="horizontal" data-disabled={vm.busy}><Checkbox id={'grant-' + grant.toolName} checked={grant.allowed} disabled={vm.busy} onCheckedChange={(checked) => vm.operator({ kind: 'set_tool_grant', toolName: grant.toolName, allowed: checked })} /><Field.Label for={'grant-' + grant.toolName}>{label ? `${label.title} · ${label.origin}` : grant.toolName}</Field.Label></Field.Field>
        {/each}
      </Field.Group></Field.Set>
      </section>
      {/if}
      {#if vm.settingsSection === 'integrations'}
      <section class="settings-section">
        <h2>Codex</h2><p class="text-muted-foreground">Connect through the Codex app on this Mac. Sign-in and account access are managed there.</p>
        <p class="text-sm text-muted-foreground">Choose a model and effort in your conversation. Switching to another agent is not available yet.</p>
      </section>
      <section class="settings-section">
      <h2>Plugins</h2><p class="text-muted-foreground">Inspect installed plugins and configure their connections.</p><Button variant="outline" class="w-fit" onclick={() => vm.primaryView = 'plugins'}>Open Plugins</Button>
      </section>
      {/if}
    </section>
  {/if}
  </div>
</main>
