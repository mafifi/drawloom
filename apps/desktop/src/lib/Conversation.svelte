<script lang="ts">
  import { tick } from 'svelte';
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
    Message,
    Bubble,
    Marker,
    Spinner,
  } from "@drawloom/ui";
  import { PanelIcon, DocumentIcon } from "@drawloom/ui";
  import Composer from "./Composer.svelte";
  import KnowledgeDisclosure from './KnowledgeDisclosure.svelte';
  import ArtifactViewer from "./ArtifactViewer.svelte";
  import AttachmentCard from "./AttachmentCard.svelte";
  import ResourceCard from './ResourceCard.svelte';
  import ElicitationForm from './ElicitationForm.svelte';
  import ApprovalView from './ApprovalView.svelte';
  import { presentToolOutcome } from './tool-outcome.js';
  import type { DesktopViewModel } from "./view-model.svelte.js";
  let { vm }: { vm: DesktopViewModel } = $props();
  let inputValue = $state("{}");
  let assignmentProjectId = $state('');
  let scroll: HTMLDivElement;
  let focusedSearchAnchor = '';
  $effect(() => {
    const anchorId = vm.history.anchorId;
    if (!anchorId) { focusedSearchAnchor = ''; return; }
    if (anchorId === focusedSearchAnchor) return;
    void tick().then(() => {
      const anchor = [...scroll.querySelectorAll<HTMLElement>('[data-history-id]')].find(element => element.dataset.historyId === anchorId);
      if (!anchor) return;
      focusedSearchAnchor = anchorId; anchor.scrollIntoView({ block: 'center' }); anchor.focus({ preventScroll: true });
    });
  });
  async function earlier() {
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
      onclick={() => (vm.detailsOpen = !vm.detailsOpen)}
      ><PanelIcon aria-hidden="true" /></Button
    >
  </header>
  <Separator />
  <div class="conversation-scroll scroll-fade scroll-fade-4" bind:this={scroll} aria-live="polite">
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
    {#if vm.history.error || vm.history.status?.message}<Alert.Root role="status"><Alert.Description>{vm.history.error || vm.history.status?.message}</Alert.Description></Alert.Root>{/if}
    {#if vm.history.hasOlder}<StatefulButton variant="ghost" disabled={vm.history.loading} pending={vm.history.loading && vm.history.loadingEarlier} onclick={earlier}>Load earlier</StatefulButton>{/if}
    {#if !vm.history.atLatest}<StatefulButton variant="ghost" disabled={vm.history.loading} pending={vm.history.loading && !vm.history.loadingEarlier} onclick={() => vm.loadLatest()}>Back to latest</StatefulButton>{/if}
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
          </p>{/if}</Empty.Content
        ></Empty.Root
      >
    {/if}
    {#each vm.history.entries as message (message.id)}
      <Message.Root role="article" class={'mb-7 outline-none ' + (message.id === vm.history.anchorId ? 'bg-muted' : '')} data-history-id={message.id} data-search-anchor={message.id === vm.history.anchorId ? 'true' : undefined} tabindex={message.id === vm.history.anchorId ? -1 : undefined} align={message.role === 'user' ? 'end' : 'start'} aria-label={(message.role === 'user' ? 'Your message' : 'Drawloom message') + (message.id === vm.history.anchorId ? ' · Search match' : '')}>
        <Message.Content>
          <h2 class="sr-only">{message.role === "user" ? "You" : "Drawloom"}</h2>
          {#if message.text}<Bubble.Root variant={message.role === 'user' ? 'default' : 'ghost'} align={message.role === 'user' ? 'end' : 'start'}><Bubble.Content><p class="conversation-text">{message.text}</p></Bubble.Content></Bubble.Root>{/if}
          {#if message.selections?.length}<Message.Footer class="flex-wrap gap-2">{#each message.selections as selection}<Badge variant="outline">{selection.title} · {selection.source}</Badge>{/each}</Message.Footer>{/if}
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
        </Message.Content>
      </Message.Root>
    {/each}
    {#each vm.state?.activity ?? [] as result}
      {@const outcome = presentToolOutcome(result)}
      <Collapsible.Root class="tool-row"
        ><Collapsible.Trigger
          >{#snippet child({ props })}<Button
              {...props}
              variant="ghost"
              class="w-full justify-between"
              ><Marker.Root class="flex-1"><Marker.Content
                >{outcome.label}</Marker.Content></Marker.Root
              ><Badge variant="secondary"
                >{outcome.statusLabel}</Badge
              ></Button
            >{/snippet}</Collapsible.Trigger
        ><Collapsible.Content>
          <p class="text-sm text-muted-foreground">{outcome.description}</p>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </Collapsible.Content
        ></Collapsible.Root
      ><Separator />
    {/each}
    {#if vm.artifact}<Button
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
    {#each vm.state?.elicitations ?? [] as request (request.requestId)}<ElicitationForm {vm} {request} />{/each}
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
      {:else if signal.kind === "operation.failed"}<Alert.Root
          variant="destructive"
          ><Alert.Description>{signal.failure.summary}</Alert.Description
          ></Alert.Root
        >
      {:else if signal.kind === "operation.interrupted"}<Marker.Root><Marker.Content>Operation stopped.</Marker.Content></Marker.Root>{/if}
    {/each}
    {#if vm.state?.activeOperation}<Marker.Root role="status"><Marker.Content><span class="shimmer">Working…</span> You can continue editing your message.</Marker.Content></Marker.Root>{/if}
  </div>
  <Composer {vm} />
</main>
