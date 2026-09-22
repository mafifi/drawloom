<script lang="ts">
  import { tick, untrack } from 'svelte';
  import ConversationRail from './ConversationRail.svelte';
  import { messageFile } from './message-file.js';
  import { structuredMessage } from './message-presentation.js';
  import { projectConversation } from './conversation-presentation.js';
  import { ConversationScroll, conversationTurns, conversationScrollGeometry } from './conversation-scroll.js';
  import {
    Alert,
    Badge,
    Button,
    StatefulButton,
    Collapsible,
    Empty,
    Field,
    Separator,
    Textarea,
    Sidebar,
    Select,
    ChatMessage,
    ChatContainer,
    SystemMessage,
    PromptSuggestion,
    Marker,
    Spinner,
    Markdown,
    Tool,
    Plan,
    Task,
  } from "@drawloom/ui";
  import { PanelIcon, DocumentIcon } from "@drawloom/ui";
  import Composer from "./Composer.svelte";
  import GoalControls from "./GoalControls.svelte";
  import KnowledgeDisclosure from './KnowledgeDisclosure.svelte';
  import ArtifactViewer from "./ArtifactViewer.svelte";
  import AttachmentCard from "./AttachmentCard.svelte";
  import ResourceCard from './ResourceCard.svelte';
  import ElicitationForm from './ElicitationForm.svelte';
  import ApprovalView from './ApprovalView.svelte';
  import { elicitationFormActions, elicitationFormPresentation } from './elicitation-form.js';
  import { goalControlsActions, goalControlsPresentation } from './goal-controls.js';
  import { groupToolActivity, toolActivityTitle } from './tool-outcome.js';
  import ToolActivity from './ToolActivity.svelte';
  import type { DesktopViewModel } from "./view-model.svelte.js";
  let { vm }: { vm: DesktopViewModel } = $props();
  let inputValue = $state("{}");
  let goalControls: { createGoal(): Promise<void> } | undefined = $state();
  let composer: { focus(): void } | undefined = $state();
  let assignmentProjectId = $state('');
  let scroll = $state<HTMLDivElement>(null!);
  let content = $state<HTMLDivElement>(null!);
  let chat: { stopScroll(): void; scrollToBottom(options?: 'instant'): boolean | Promise<boolean> };
  const reading = new ConversationScroll();
  let activeTurn = $state('');
  const turns = $derived(conversationTurns(vm.history.entries));
  const presentation = $derived(projectConversation(vm.history.entries, vm.history.anchorId));
  const activity = $derived(groupToolActivity(vm.state?.activity ?? [], vm.history.entries));
  const workbenchView = $derived(vm.state?.views.find(view => view.workbenchId === vm.conversation?.workbenchId));
  function syncScroll() {
    reading.scrolled(scroll.scrollTop, scroll.clientHeight, scroll.scrollHeight);
    const top = scroll.getBoundingClientRect().top + conversationScrollGeometry.activeTurnThreshold;
    const anchors = Array.from(scroll.querySelectorAll<HTMLElement>('[data-user-turn]'));
    activeTurn = anchors.findLast(element => element.getBoundingClientRect().top <= top)?.dataset.historyId ?? anchors[0]?.dataset.historyId ?? '';
  }
  function jump(id: string) {
    reading.leaveTail();
    chat?.stopScroll();
    const anchor = Array.from(scroll.querySelectorAll<HTMLElement>('[data-history-id]')).find(element => element.dataset.historyId === id);
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - conversationScrollGeometry.navigationInset;
    scroll.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    anchor.focus({ preventScroll: true });
  }
  $effect(() => {
    const id = vm.conversation?.id ?? '';
    const follow = reading.update(id, vm.history.loading, vm.history.entries.length > 0, !!vm.history.anchorId || !vm.history.atLatest);
    if (!follow) return;
    let cancelled = false;
    void tick().then(() => { if (!cancelled && reading.following && scroll) { scroll.scrollTop = scroll.scrollHeight; syncScroll(); } });
    return () => { cancelled = true; };
  });
  $effect(() => {
    if (!scroll || !content) return;
    const observer = new ResizeObserver(() => {
      syncScroll();
    });
    observer.observe(content); observer.observe(scroll);
    return () => observer.disconnect();
  });
  let focusedSearchAnchor = '';
  $effect(() => {
    const anchorId = vm.history.anchorId;
    if (!anchorId) { focusedSearchAnchor = ''; return; }
    chat?.stopScroll();
    if (anchorId === focusedSearchAnchor) return;
    void tick().then(() => {
      const anchor = [...scroll.querySelectorAll<HTMLElement>('[data-history-id]')].find(element => element.dataset.historyId === anchorId);
      if (!anchor) return;
      focusedSearchAnchor = anchorId; anchor.scrollIntoView({ block: 'center' }); anchor.focus({ preventScroll: true });
    });
  });
  async function earlier() {
    reading.leaveTail();
    chat?.stopScroll();
    const anchor = [...scroll.querySelectorAll<HTMLElement>('[data-history-id]')].find(element => element.getBoundingClientRect().bottom >= scroll.getBoundingClientRect().top);
    const offset = anchor?.getBoundingClientRect().top;
    await vm.loadEarlier(); await tick();
    if (anchor?.isConnected && offset !== undefined) scroll.scrollTop += anchor.getBoundingClientRect().top - offset;
  }
</script>

<main class="conversation">
  <header class="conversation-header">
    <Sidebar.Trigger
      id="navigation-toggle"
      aria-controls="workspace-navigation"
      aria-label="Toggle navigation"
    />
    <div>
      <h1>{vm.conversation?.title ?? "Drawloom"}</h1>
      <p class="text-muted-foreground">
        {vm.state?.workbenches.find(
          (w) => w.id === vm.conversation?.workbenchId,
        )?.title ?? "Local workspace"}
        {#if vm.conversation}<Badge variant="outline"
          >{vm.conversation?.provider === "codex"
            ? "Codex"
            : "Synthetic mode"}</Badge
        >{/if}
        {#if vm.conversationProject}<Badge variant="outline">{vm.conversationProject.name}</Badge>{/if}
      </p>
    </div>
    <Button
      id="artifact-toggle"
      variant="ghost"
      size="icon"
      aria-label="Toggle artifact pane"
      aria-expanded={vm.detailsOpen}
      onclick={() => { if (!vm.detailsOpen) vm.workspaceMode = 'plugin'; vm.detailsOpen = !vm.detailsOpen; }}
      ><PanelIcon aria-hidden="true" /></Button
    >
  </header>
  <Separator />
  <div class="conversation-body">
  <ConversationRail items={turns} activeId={activeTurn} navigate={jump} />
  <ChatContainer.Root class="conversation-scroll flex-col scroll-fade scroll-fade-4" bind:this={chat} bind:ref={scroll} initial={false} resize="instant" onscroll={syncScroll} aria-live="polite">
  <ChatContainer.Content class="conversation-content" bind:ref={content}>
    {#if vm.conversation && !vm.conversation.projectId}
      <div class="flex flex-col items-start gap-3 py-4">
        <p>This saved conversation has no project. Select a project to continue; its history remains available.</p>
        <Select.Root type="single" bind:value={assignmentProjectId}><Select.Trigger aria-label="Project for saved conversation">{vm.state?.projects.find(project => project.id === assignmentProjectId)?.name ?? 'Select a project'}</Select.Trigger><Select.Content>{#each vm.state?.projects ?? [] as project}<Select.Item value={project.id} label={project.name} disabled={!project.available} />{/each}</Select.Content></Select.Root>
        <StatefulButton disabled={vm.busy || !assignmentProjectId} pending={vm.pendingCommand?.kind === 'assign_project'} pendingLabel="Assigning project" onclick={() => vm.assignProject(assignmentProjectId)}>Assign project</StatefulButton>
        <Button variant="ghost" onclick={() => { vm.primaryView = 'projects'; }}>Add project</Button>
      </div>
    {:else if vm.conversation && !vm.conversationProject?.available}
      <Alert.Root><Alert.Description>This project folder is unavailable. Saved history remains readable; reconnect the folder to continue working.</Alert.Description></Alert.Root>
    {/if}
    {#if vm.history.error || vm.history.status?.message}<SystemMessage class="conversation-notice" variant={vm.history.error ? 'error' : 'warning'} role="status">{vm.history.error || vm.history.status?.message}</SystemMessage>{/if}
    {#if vm.history.hasOlder}<StatefulButton variant="ghost" disabled={vm.history.loading} pending={vm.history.loading && vm.history.loadingEarlier} onclick={earlier}>Load earlier</StatefulButton>{/if}
    {#if !vm.history.atLatest}<StatefulButton variant="ghost" disabled={vm.history.loading} pending={vm.history.loading && !vm.history.loadingEarlier} onclick={async () => { await vm.loadLatest(); reading.latest(); await tick(); scroll.scrollTop = scroll.scrollHeight; }}>Back to latest</StatefulButton>{/if}
    {#if vm.history.status?.sync === 'syncing'}<Marker.Root role="status"><Marker.Icon><Spinner /></Marker.Icon><Marker.Content>Synchronizing saved history…</Marker.Content></Marker.Root>{/if}
    {#if vm.history.loading}<Marker.Root role="status"><Marker.Icon><Spinner /></Marker.Icon><Marker.Content>Loading conversation…</Marker.Content></Marker.Root>{/if}
    {#if !vm.history.entries.length && !vm.history.loading}
      <Empty.Root class="welcome"
        ><Empty.Header
          ><Empty.Title>{vm.conversation ? 'A place to do the work' : vm.selectedProject ? vm.selectedProject.name : 'Select a project'}</Empty.Title><Empty.Description
            >{vm.conversation ? 'Bring a draft, inspect the details, and choose what to keep.' : 'Choose a project folder before starting a conversation.'}</Empty.Description
          ></Empty.Header
        ><Empty.Content
          >{#if !vm.conversation}
            {#if vm.canCreate}<StatefulButton disabled={vm.busy} pending={vm.creationSource === 'new'} onclick={() => vm.create()}>New conversation</StatefulButton>{/if}
            <Button variant="ghost" onclick={() => { vm.primaryView = 'projects'; }}>Add project</Button>
          {:else}<p class="text-muted-foreground">
            {vm.conversation?.provider === "codex"
              ? "Your conversation continues through the local Codex process."
              : vm.canSend
                ? "Synthetic mode saves your text as a draft without calling a model."
                : "Local review is available. Synthetic agent messaging supports Text studio only."}
          </p><PromptSuggestion disabled={!vm.canSend} onclick={() => { vm.draft = 'Help me get started. What would you suggest we work on first?'; }}>Help me get started</PromptSuggestion>{/if}</Empty.Content
        ></Empty.Root
      >
    {/if}
    {#each presentation as node (node.id)}
      {#if node.kind === 'proposal'}
        <ChatMessage.Root><ChatMessage.Content>
        <Plan.Root open={node.latest} data-history-id={node.id} tabindex={-1}>
          <Plan.Header><Plan.Title>{node.latest ? 'Proposed plan' : 'Earlier proposal'}</Plan.Title><Plan.Action><Plan.Trigger /></Plan.Action></Plan.Header>
          <Plan.Content><Markdown text={node.entry.text} />
            {#if node.entry.state === 'partial'}<p class="text-muted-foreground" role="status">Preparing proposal…</p>
            {:else if node.entry.state === 'interrupted'}<p class="text-muted-foreground">Proposal interrupted. Ask to continue in the conversation.</p>{/if}
          </Plan.Content>
          {#if node.implementable}<Plan.Footer><StatefulButton pending={vm.pendingCommand?.kind === 'implement_plan'} disabled={vm.busy || !!vm.state?.activeOperation || !vm.state?.modes.includes('default')} onclick={()=>void vm.implementPlan(node.id)}>Implement plan</StatefulButton></Plan.Footer>{/if}
        </Plan.Root>
        </ChatMessage.Content></ChatMessage.Root>
      {:else if node.kind === 'plan' && node.entry.origin.kind === 'plan'}
        <ChatMessage.Root><ChatMessage.Content>
        <Plan.Root open={node.expanded} data-history-id={node.id} tabindex={-1}>
          <Plan.Header><Plan.Title>{node.latest ? 'Plan' : 'Earlier plan'}</Plan.Title><Plan.Action><Plan.Trigger /></Plan.Action></Plan.Header>
          <Plan.Content>
            {#if node.entry.origin.plan.explanation}<Markdown text={node.entry.origin.plan.explanation} />{/if}
            {#if node.entry.origin.plan.steps.length}
              <Task.Root open><Task.Trigger title="Task progress" /><Task.Content><ol class="layout-stack">{#each node.entry.origin.plan.steps as step}<li><Task.Item><Badge variant="outline">{step.status === 'in_progress' ? 'In progress' : step.status === 'completed' ? 'Completed' : 'Pending'}</Badge> <span>{step.text}</span></Task.Item></li>{/each}</ol></Task.Content></Task.Root>
            {:else}<p class="text-muted-foreground">No steps in this plan update.</p>{/if}
          </Plan.Content>
        </Plan.Root>
        </ChatMessage.Content></ChatMessage.Root>
      {:else if node.kind === 'process'}
        <Collapsible.Root open={node.expanded} class="conversation-process">
          <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost">Tool activity · {node.entries.length}{node.needsAttention ? ' · Needs attention' : ' completed'}</Button>{/snippet}</Collapsible.Trigger>
          <Collapsible.Content>
            {#each node.entries as message (message.id)}
              {#if message.origin.kind === 'tool'}
                <Tool.Root open={message.origin.outcome !== 'completed' || message.id === vm.history.anchorId} data-history-id={message.id} data-search-anchor={message.id === vm.history.anchorId ? 'true' : undefined} tabindex={-1}>
                  <Tool.Header type={toolActivityTitle(message.origin.title, vm.state?.toolLabels ?? [])} state={message.origin.outcome === 'completed' ? 'output-available' : 'output-error'} statusLabel={message.origin.outcome === 'unknown' ? 'Outcome uncertain' : message.origin.outcome} />
                  <Tool.Content>
                    <div class="conversation-tool-output"><Markdown text={structuredMessage(message) ? '```json\n' + structuredMessage(message) + '\n```' : message.text} /></div>
                    {#each message.assets as asset}<AttachmentCard {asset} title={vm.attachmentName(asset.key)} />{/each}
                    {#each message.resources ?? [] as reference}<ResourceCard presentation={vm.resourceCardPresentation(message.id, reference)} actions={{ openWorkspace: () => vm.openResourceWorkspace(message.id, reference), read: () => void vm.readResource(message.id, reference), toggleContext: () => vm.toggleResource(message.id, reference) }} />{/each}
                  </Tool.Content>
                </Tool.Root>
              {:else if message.origin.kind === 'delegation'}
                {@const child = vm.delegationCard(message.origin.child)}
                <Tool.Root open={child.expanded || message.id === vm.history.anchorId} data-history-id={message.id} tabindex={-1}>
                  <Tool.Header type={child.label} state={child.state} statusLabel={child.statusLabel} />
                  <Tool.Content>
                    <div class="layout-stack">
                      {#if child.result}<div class="conversation-tool-output"><Markdown text={child.result} /></div>{/if}
                      <p class="text-muted-foreground">{child.note}</p>
                      <div class="layout-row">
                        <StatefulButton variant="outline" size="sm" pending={vm.pendingCommand?.kind === 'inspect_delegation' && vm.pendingCommand.childId === child.id} disabled={vm.busy || !child.inspect} onclick={()=>void vm.inspectDelegation(child.id)}>Refresh task</StatefulButton>
                        <Button variant="outline" size="sm" disabled={vm.busy || !child.followUp} onclick={()=>{vm.prepareDelegation(child.id);composer?.focus();}}>Follow up</Button>
                        {#if child.interrupt}<StatefulButton variant="outline" size="sm" pending={vm.pendingCommand?.kind === 'interrupt_delegation' && vm.pendingCommand.child.id === child.id} disabled={vm.busy} onclick={()=>void vm.interruptDelegation(child.id)}>Interrupt task</StatefulButton>{/if}
                      </div>
                    </div>
                  </Tool.Content>
                </Tool.Root>
              {/if}
            {/each}
          </Collapsible.Content>
        </Collapsible.Root>
      {:else}
      {@const message = node.entry}
      <ChatMessage.Root role="article" speaker={message.role} class={message.id === vm.history.anchorId ? 'bg-muted' : ''} data-history-id={message.id} data-user-turn={message.role === 'user' ? '' : undefined} data-search-anchor={message.id === vm.history.anchorId ? 'true' : undefined} tabindex={-1} aria-label={(message.role === 'user' ? 'Your message' : 'Drawloom message') + (message.id === vm.history.anchorId ? ' · Search match' : '')}>
          <h2 class="sr-only">{message.role === "user" ? "You" : "Drawloom"}</h2>
          {#if message.text}<ChatMessage.Content ><Markdown text={message.text} streaming={message.role === 'assistant' && message.state === 'partial' && message.operationId === vm.state?.activeOperation} resolveFile={url => vm.conversationProject?.available ? messageFile(url, vm.conversation?.id ?? '', vm.conversationProject.directory)?.url : undefined}/></ChatMessage.Content>{/if}
          {#if message.selections?.length}<ChatMessage.Actions class="flex-wrap gap-2">{#each message.selections as selection}<Badge variant="outline">{selection.title} · {selection.source}</Badge>{/each}</ChatMessage.Actions>{/if}
          {#if message.preparation}<KnowledgeDisclosure summary={message.preparation} />{/if}
          {#each message.assets as asset}<AttachmentCard {asset} title={vm.attachmentName(asset.key)} />{/each}
          {#each message.resources ?? [] as reference}
            <ResourceCard
              presentation={vm.resourceCardPresentation(message.id, reference)}
              actions={{
                openWorkspace: () => vm.openResourceWorkspace(message.id, reference),
                read: () => void vm.readResource(message.id, reference),
                toggleContext: () => vm.toggleResource(message.id, reference),
              }}
            />
          {/each}
      </ChatMessage.Root>
      <ToolActivity results={activity.get(message.id) ?? []} toolLabels={vm.state?.toolLabels ?? []} />
      {/if}
    {/each}
    <ToolActivity results={activity.get('') ?? []} toolLabels={vm.state?.toolLabels ?? []} historical />
    {#if workbenchView}<Button variant="outline" class="artifact-row mx-auto justify-between" onclick={() => { vm.workspaceMode = 'plugin'; vm.detailsOpen = true; }}><DocumentIcon aria-hidden="true" /><span>Open workbench</span></Button>
    {:else if vm.artifact}<Button
        variant="outline"
        class="artifact-row mx-auto justify-between"
        onclick={() => {
          vm.openArtifactWorkspace();
        }}
        ><DocumentIcon aria-hidden="true" /><span class="truncate"
          >{vm.artifact.title}{vm.candidate &&
          vm.candidate.label !== vm.artifact.title
            ? ` · ${vm.candidate.label}`
            : ""}</span
        ><span>Open</span></Button
      >{/if}
    {#each vm.state?.elicitations ?? [] as request (request.requestId)}<ElicitationForm presentation={elicitationFormPresentation(vm, request.requestId)} actions={elicitationFormActions(vm, request.requestId)} {request} />{/each}
    {#each vm.approvals as approval (approval.id)}<ApprovalView presentation={approval.presentation} actions={approval.actions} />{/each}
    {#each vm.state?.signals ?? [] as signal}
      {#if signal.kind === "input.requested" && vm.state?.activeOperation === signal.request.operationId && !vm.state.signals.some((s) => s.kind === "input.resolved" && s.requestId === signal.request.requestId)}
        <Alert.Root class="interaction"
          ><Alert.Title>Requested information</Alert.Title><Alert.Description
            ><p>{signal.request.prompt}</p>
            <Collapsible.Root
              ><Collapsible.Trigger
                >{#snippet child({ props })}<Button {...props} variant="ghost"
                    >Response format</Button
                  >{/snippet}</Collapsible.Trigger
              ><Collapsible.Content
                ><pre>{JSON.stringify(
                    signal.request.responseSchema,
                    null,
                    2,
                  )}</pre></Collapsible.Content
              ></Collapsible.Root
            ><Field.Group
              ><Field.Field
                ><Field.Label
                  for={"requested-input-" + signal.request.requestId}
                  >Requested information as JSON</Field.Label
                ><Textarea
                  id={"requested-input-" + signal.request.requestId}
                  bind:value={inputValue}
                /></Field.Field
              ></Field.Group
            >
            <div class="flex gap-2">
              <StatefulButton
                disabled={vm.busy}
                pending={vm.pendingCommand?.kind === 'input' && vm.pendingCommand.resolution.action !== 'cancel'}
                onclick={() =>
                  vm.submitInput(signal.request.requestId, inputValue)}
                >Submit</StatefulButton
              ><StatefulButton
                variant="outline"
                disabled={vm.busy}
                pending={vm.pendingCommand?.kind === 'input' && vm.pendingCommand.resolution.action === 'cancel'}
                onclick={() =>
                  vm.command({
                    kind: "input",
                    conversationId: vm.state!.selectedId,
                    resolution: {
                      requestId: signal.request.requestId,
                      action: "cancel",
                    },
                  })}>Cancel</StatefulButton
              >
            </div></Alert.Description
          ></Alert.Root
        >
      {:else if signal.kind === 'provider.observation' && signal.name === 'approval-review'}
        <Marker.Root role="status"><Marker.Content>Automatic review: {signal.summary}</Marker.Content></Marker.Root>
      {:else if signal.kind === "operation.failed"}<SystemMessage
          variant="error"
          >{signal.failure.summary}</SystemMessage
        >
      {:else if signal.kind === "operation.interrupted"}<Marker.Root><Marker.Content>Operation stopped.</Marker.Content></Marker.Root>{/if}
    {/each}
    {#if vm.state?.activeOperation}<Marker.Root role="status"><Marker.Content><span class="shimmer">Working…</span> You can continue editing your message.</Marker.Content></Marker.Root>{/if}
  </ChatContainer.Content>
  <ChatContainer.ScrollButton class="sticky bottom-3 ml-auto mr-2 my-3 shrink-0" onclick={() => reading.latest()} />
  </ChatContainer.Root>
  </div>
  <Composer {vm} bind:this={composer} onCreateGoal={() => void goalControls?.createGoal()}>
    {#snippet goal()}{#key vm.conversation?.id}<GoalControls presentation={goalControlsPresentation(vm)} actions={goalControlsActions(vm)} bind:this={goalControls} onDismiss={() => composer?.focus()} />{/key}{/snippet}
  </Composer>
</main>
