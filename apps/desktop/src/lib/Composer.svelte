<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { mentionToken } from './mention-token.js';
  import ComposerResources from './ComposerResources.svelte';
  import CodexModelSelector from './CodexModelSelector.svelte';
  import {
    Alert,
    Dialog,
    Button,
    Collapsible,
    Field,
    Input,
    PromptInput,
    StatefulButton,
    DropdownMenu,
    ShieldIcon,
    HandIcon,
    Attachment,
    DocumentIcon,
    Spinner,
  } from "@drawloom/ui";
  import { CloseIcon, PlusIcon, StopIcon, ArrowIcon } from "@drawloom/ui";
  import type { ComposerPresentation, ComposerActions } from "./composer-view.js";
  import DiscoveryPicker from './DiscoveryPicker.svelte';
  import ArtifactViewer from './ArtifactViewer.svelte';
  let { presentation: p, actions, onCreateGoal, goal }: { presentation: ComposerPresentation; actions: ComposerActions; onCreateGoal(): void; goal?: Snippet } = $props();
  let fileInput = $state<HTMLInputElement | null>(null);
  let messageInput = $state<HTMLTextAreaElement | null>(null);
  let anchor = $state<HTMLDivElement|null>(null);
  let picker: {keydown(event:KeyboardEvent):void};
  let tokenStart:number|undefined;
  let resourcesOpen=$state(false);
  export function focus() { messageInput?.focus(); }
  function updateToken(){
    if(!messageInput)return;
    const token=mentionToken(messageInput.value,messageInput.selectionStart,messageInput.selectionEnd);
    tokenStart=token?.start;
    if(token)actions.openPicker(token.kind,token);else actions.setPickerOpen(false);
  }
  async function selected(){await tick();messageInput?.focus();if(tokenStart!==undefined)messageInput?.setSelectionRange(tokenStart,tokenStart);tokenStart=undefined;}
  async function openAdd(){
    if(p.pickerOpen){actions.setPickerOpen(false);messageInput?.focus();return;}
    actions.openPicker('add');
    await tick();messageInput?.focus();
  }
  function typedReference(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement;
    actions.setDraft(input.value);
    updateToken();
  }
</script>

<div class="composer-area">
  <div class="layout-stack">
  {#if resourcesOpen}<section class="max-h-72 overflow-auto rounded-xl border bg-popover"><Button variant="ghost" onclick={()=>resourcesOpen=false}>Close resources</Button><ComposerResources presentation={p.resources} actions={actions.resources}/></section>{/if}
  {#if p.error}<Alert.Root variant="destructive"
      ><Alert.Description>{p.error}</Alert.Description></Alert.Root
    >{/if}
  {#if p.canExecute && !p.canSend}<p class="composer-note text-muted-foreground">
      Synthetic agent supports Text studio only. Local artifacts and review
      remain available. Select Codex for a model conversation; sending uses your
      account.
    </p>{/if}
  <div class="composer-dock">
  {@render goal?.()}
  <form
    class="composer"
    ondragover={(event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); }}
    ondrop={(event) => { if (event.dataTransfer?.files.length) { event.preventDefault(); void actions.importFiles(event.dataTransfer.files); } }}
    onsubmit={(event) => {
      event.preventDefault();
      void actions.send();
    }}
  >
    <Collapsible.Root open={p.contextOpen} onOpenChange={actions.setContextOpen}>
      <Field.Label for="message-draft" class="sr-only">Message</Field.Label>
      <PromptInput.Root value={p.draft} onValueChange={value => actions.setDraft(value)} disabled={!p.canExecute} class="relative bg-muted border-transparent" bind:ref={anchor}>
          {#if p.delegationReferences.length}
            <div class="layout-row px-3 pt-3">
              {#each p.delegationReferences as reference (reference.id)}
                <Button type="button" variant="secondary" size="sm"
                  aria-label={'Remove task reference ' + reference.label}
                  onclick={() => actions.removeDelegationReference(reference.id)}>
                  Follow up: {reference.label}<CloseIcon aria-hidden="true" />
                </Button>
              {/each}
            </div>
          {/if}
          {#if p.conversation?.mode === 'plan'}
            <div class="layout-row px-3 pt-3"><Button type="button" size="sm" variant="secondary" disabled={p.busy || !!p.state?.activeOperation} aria-label="Leave Plan mode" onclick={()=>void actions.setMode('default')}>Plan mode <CloseIcon aria-hidden="true" /></Button></div>
          {/if}
          <PromptInput.Textarea
            id="message-draft"
            class="min-h-20 max-h-60 px-3 pt-3 scroll-fade scroll-fade-2"
            placeholder="Ask or make a change…"
            disabled={!p.canExecute}
            bind:ref={messageInput}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={p.pickerOpen?'composer-mention-list':undefined}
            aria-expanded={p.pickerOpen}
            aria-haspopup="listbox"
            aria-activedescendant={p.pickerOpen&&p.pickerActiveId?'mention-'+encodeURIComponent(p.pickerActiveId):undefined}
            onkeyup={event=>{if(p.pickerOpen&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))updateToken();}}
            onclick={()=>{if(p.pickerOpen)updateToken();}}
            onselect={()=>{if(p.pickerOpen && messageInput && messageInput.selectionStart!==messageInput.selectionEnd)updateToken();}}
            oninput={typedReference}
            onpaste={(event) => { const files = event.clipboardData?.files; if (files?.length) { event.preventDefault(); void actions.importFiles(files); } }}
            onkeydown={(event) => {
              if (event.isComposing) return;
              if (p.pickerOpen) {
                picker.keydown(event);
                if(event.defaultPrevented)return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!p.busy) void actions.send();
              }
            }}
          />
      <DiscoveryPicker bind:this={picker} presentation={p.picker} actions={actions.picker} input={messageInput} {anchor} onSelected={selected} onAttach={()=>fileInput?.click()} onBrowse={()=>resourcesOpen=true} {onCreateGoal}/>
      {#if p.attachments.length}<Attachment.Group class="w-full px-3" role="list" aria-label="Attachments" tabindex={0}>
        {#each p.attachments as attachment (attachment.id)}<div role="listitem" class="flex w-56 shrink-0 snap-start flex-col gap-2">
          <Attachment.Root state={attachment.status === 'pending' ? 'uploading' : attachment.status === 'failed' ? 'error' : 'done'} class="w-full" aria-busy={attachment.status === 'pending'}>
            <Attachment.Media variant={attachment.asset?.mediaType.startsWith('image/') ? 'image' : 'icon'}>
              {#if attachment.asset?.mediaType.startsWith('image/')}<img src={'/api/assets/' + encodeURIComponent(attachment.asset.key)} alt={attachment.name} />{:else if attachment.status === 'pending'}<Spinner />{:else}<DocumentIcon />{/if}
            </Attachment.Media>
            <Attachment.Content>
              <Attachment.Title title={attachment.name}>{attachment.name}</Attachment.Title>
              <Attachment.Description>{(attachment.size / 1024).toFixed(1)} KB · {attachment.mediaType}</Attachment.Description>
              {#if attachment.status === 'pending'}<Attachment.Description role="status">Importing attachment</Attachment.Description>{/if}
            </Attachment.Content>
            <Attachment.Actions><Attachment.Action type="button" aria-label={`Remove ${attachment.name}`} onclick={() => actions.removeAttachment(attachment.id)}><CloseIcon aria-hidden="true" /></Attachment.Action></Attachment.Actions>
          </Attachment.Root>
          {#if attachment.asset && !attachment.asset.mediaType.startsWith('image/')}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview file</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><ArtifactViewer artifact={{ id: attachment.id, title: attachment.name, content: { kind: 'asset', asset: attachment.asset } }} /></Collapsible.Content></Collapsible.Root>{/if}
          {#if attachment.status === 'failed'}<p role="status" class="text-xs text-muted-foreground">{attachment.error}</p><StatefulButton variant="ghost" size="sm" disabled={p.importing || !actions.canRetryAttachment(attachment.id)} onclick={() => actions.retryAttachment(attachment.id)}>Retry</StatefulButton>{:else if attachment.status === 'ready' && !attachment.mediaType.startsWith('image/') && !attachment.mediaType.startsWith('text/')}<p class="text-xs text-muted-foreground">Preview available; not a direct model input. Remove before sending.</p>{/if}
        </div>{/each}
      </Attachment.Group>{/if}
      <div class="flex w-full flex-wrap gap-2 px-3">
        {#each p.conversationContextIds as id}<Button variant="secondary" size="sm" title="Shares up to 12 completed cached messages, limited to 8,000 characters. No files or permissions are shared." aria-label={`Remove conversation ${p.conversationLabels.find(item=>item.id===id)?.label??id}`} onclick={()=>actions.removeConversationContext(id)}>{p.conversationLabels.find(item=>item.id===id)?.label??'Unavailable conversation'} · Recent context<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each p.selectedDiscoveries as selection}<Button variant="secondary" size="sm" aria-label={`Remove ${selection.name} from ${selection.origin}`} onclick={() => actions.removeDiscovery(selection.id)}>{selection.name} · {selection.origin}{selection.unavailable ? ' · unavailable' : ''}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each p.contextLabels as item}<Button variant="secondary" size="sm" aria-label={`Remove ${item.label}`} onclick={() => actions.toggleContext(item.id)}>{item.label}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each p.selectedResources as resource}<Button variant="secondary" size="sm" aria-label={`Remove ${resource.title}`} onclick={() => actions.removeResource(resource.entryId, resource.resourceId)}>{resource.title} · {resource.source}<CloseIcon aria-hidden="true" /></Button>{/each}
      </div>
      {#if p.state?.activeContext}<Collapsible.Root class="w-full px-3"><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Current app context</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">{p.state.activeContext}</p></Collapsible.Content></Collapsible.Root>{/if}
      <PromptInput.Actions class="composer-toolbar gap-1">
        <Input
          class="hidden"
          aria-label="Choose attachments"
          type="file"
          bind:ref={fileInput}
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/mp4,video/webm,application/pdf,text/plain,.md"
          onchange={() => {
            if (fileInput) {
              void actions.importFiles(fileInput.files);
              fileInput.value = "";
            }
          }}
        />
        <StatefulButton
          variant="ghost"
          size="icon"
          iconOnly
          pending={p.importing}
          disabled={!p.canExecute}
          pendingLabel="Importing attachments"
          aria-label="Add to message" title="Add files, skills or context"
          onclick={()=>void openAdd()}><PlusIcon aria-hidden="true" /></StatefulButton>
        <div class="composer-spacer"></div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <StatefulButton {...props} variant="ghost" class="rounded-full" aria-label="Execution review"
                disabled={p.busy || Boolean(p.state?.activeOperation)}
                pending={p.pendingCommand?.kind === 'set_reviewer'} pendingLabel="Saving review mode">
                <ShieldIcon aria-hidden="true" /><span class="composer-review-label">{p.conversation?.reviewer === 'delegated' ? 'Approve for me' : 'Ask me'}</span>
              </StatefulButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="top" align="end" sideOffset={8} class="w-96 viewport-menu rounded-xl p-2">
            <DropdownMenu.Label class="px-2 py-2 font-normal text-muted-foreground">How should actions be reviewed?</DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={p.conversation?.reviewer ?? 'human'} onValueChange={(reviewer) => {
              if (p.conversation && (reviewer === 'human' || reviewer === 'delegated'))
                void actions.setReviewer(reviewer);
            }}>
              <DropdownMenu.RadioItem value="human" class="gap-3 p-2 pr-8">
                <HandIcon aria-hidden="true" /><span><span class="block">Ask for approval</span><span class="block text-sm text-muted-foreground">You decide when Codex requests approval.</span></span>
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="delegated" disabled={!p.state?.controls.reviewerModes.includes('delegated')} class="gap-3 p-2 pr-8">
                <ShieldIcon aria-hidden="true" /><span><span class="block">Approve for me</span><span class="block text-sm text-muted-foreground">{p.state?.controls.reviewerModes.includes('delegated') ? 'Codex reviews actions within your permissions.' : 'Not available with the current agent.'}</span></span>
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        {#if p.conversation?.provider==='codex'}
          {#key p.conversation.id}<CodexModelSelector selection={p.conversation.modelSelection} disabled={p.busy||Boolean(p.state?.activeOperation)} onSelect={selection=>{if(p.conversation)void actions.setModel(selection);}} />{/key}
        {/if}
        {#if p.state?.activeOperation}<StatefulButton
            variant="ghost"
            size="icon"
            class="rounded-full"
            iconOnly
            pending={p.pendingCommand?.kind === 'stop'}
            pendingLabel="Stopping"
            title={p.state.controls.interrupt
              ? "Stop operation"
              : "Provider does not support interruption"}
            aria-label="Stop operation"
            disabled={!p.state.controls.interrupt || p.busy}
            onclick={() =>
              p.state &&
              actions.stop()}
            ><StopIcon aria-hidden="true" /></StatefulButton
          >{/if}
        <StatefulButton
          type="submit"
          size="icon"
          class="rounded-full"
          iconOnly
          pending={p.pendingCommand?.kind === 'send'}
          pendingLabel="Sending"
          aria-label={p.state?.activeOperation
            ? "Steer operation"
            : "Send message"}
          title={p.state?.activeOperation
            ? "Send a correction to the active operation"
            : "Send message"}
          disabled={!p.canSend ||
            p.busy ||
            p.pickerOpen || p.attachments.some(item => item.status !== 'ready') ||
            !p.draft.trim() ||
            Boolean(p.state?.activeOperation && !p.state.controls.steer)}
          ><ArrowIcon aria-hidden="true" /></StatefulButton
        >
      </PromptInput.Actions>
      </PromptInput.Root>
    </Collapsible.Root>
  </form>
  </div>
  </div>
</div>
<Dialog.Root open={p.forkRequested} onOpenChange={actions.setForkRequested}>
  <Dialog.Content onCloseAutoFocus={(event) => { event.preventDefault(); messageInput?.focus(); }}>
    <Dialog.Header>
      <Dialog.Title>Fork conversation</Dialog.Title>
      <Dialog.Description>
        Create an independent conversation from completed history. Project files remain shared;
        this does not create a worktree. No goal or first message is submitted.
      </Dialog.Description>
    </Dialog.Header>
    {#if p.error}
      <Alert.Root variant="destructive"><Alert.Description>{p.error}</Alert.Description></Alert.Root>
    {/if}
    <Dialog.Footer>
      <Button variant="outline" disabled={p.busy} onclick={() => actions.setForkRequested(false)}>Cancel</Button>
      <StatefulButton pending={p.pendingCommand?.kind === 'fork_conversation'}
        pendingLabel="Creating fork" disabled={p.busy || !!p.state?.activeOperation}
        onclick={() => void actions.forkConversation()}>Fork conversation</StatefulButton>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
