<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { mentionToken } from './mention-token.js';
  import ComposerResources from './ComposerResources.svelte';
  import CodexModelSelector from './CodexModelSelector.svelte';
  import {
    Alert,
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
  import type { DesktopViewModel } from "./view-model.svelte.js";
  import DiscoveryPicker from './DiscoveryPicker.svelte';
  import ArtifactViewer from './ArtifactViewer.svelte';
  let { vm, onCreateGoal, goal }: { vm: DesktopViewModel; onCreateGoal(): void; goal?: Snippet } = $props();
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
    if(token)vm.openPicker(token.kind,token);else vm.pickerOpen=false;
  }
  async function selected(){await tick();messageInput?.focus();if(tokenStart!==undefined)messageInput?.setSelectionRange(tokenStart,tokenStart);tokenStart=undefined;}
  async function openAdd(){
    if(vm.pickerOpen){vm.pickerOpen=false;messageInput?.focus();return;}
    vm.openPicker('context');
    await tick();messageInput?.focus();
  }
  function typedReference(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement;
    vm.draft = input.value;
    updateToken();
  }
</script>

<div class="composer-area">
  <div class="layout-stack">
  {#if resourcesOpen}<section class="max-h-72 overflow-auto rounded-xl border bg-popover"><Button variant="ghost" onclick={()=>resourcesOpen=false}>Close resources</Button><ComposerResources {vm}/></section>{/if}
  {#if vm.error}<Alert.Root variant="destructive"
      ><Alert.Description>{vm.error}</Alert.Description></Alert.Root
    >{/if}
  {#if vm.canExecute && !vm.canSend}<p class="composer-note text-muted-foreground">
      Synthetic agent supports Text studio only. Local artifacts and review
      remain available. Select Codex for a model conversation; sending uses your
      account.
    </p>{/if}
  <div class="composer-dock">
  {@render goal?.()}
  <form
    class="composer"
    ondragover={(event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); }}
    ondrop={(event) => { if (event.dataTransfer?.files.length) { event.preventDefault(); void vm.importFiles(event.dataTransfer.files); } }}
    onsubmit={(event) => {
      event.preventDefault();
      void vm.send();
    }}
  >
    <Collapsible.Root bind:open={vm.contextOpen}>
      <Field.Label for="message-draft" class="sr-only">Message</Field.Label>
      <PromptInput.Root value={vm.draft} onValueChange={value => vm.draft = value} disabled={!vm.canExecute} class="relative bg-muted border-transparent" bind:ref={anchor}>
          {#if vm.conversation?.mode === 'plan'}
            <div class="layout-row px-3 pt-3"><Button type="button" size="sm" variant="secondary" disabled={vm.busy || !!vm.state?.activeOperation} aria-label="Leave Plan mode" onclick={()=>void vm.setMode('default')}>Plan mode <CloseIcon aria-hidden="true" /></Button></div>
          {/if}
          <PromptInput.Textarea
            id="message-draft"
            class="min-h-20 max-h-60 px-3 pt-3 scroll-fade scroll-fade-2"
            placeholder="Ask or make a change…"
            disabled={!vm.canExecute}
            bind:ref={messageInput}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={vm.pickerOpen?'composer-mention-list':undefined}
            aria-expanded={vm.pickerOpen}
            aria-haspopup="listbox"
            aria-activedescendant={vm.pickerOpen&&vm.pickerActiveId?'mention-'+encodeURIComponent(vm.pickerActiveId):undefined}
            onkeyup={event=>{if(vm.pickerOpen&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))updateToken();}}
            onclick={()=>{if(vm.pickerOpen)updateToken();}}
            onselect={()=>{if(vm.pickerOpen && messageInput && messageInput.selectionStart!==messageInput.selectionEnd)updateToken();}}
            oninput={typedReference}
            onpaste={(event) => { const files = event.clipboardData?.files; if (files?.length) { event.preventDefault(); void vm.importFiles(files); } }}
            onkeydown={(event) => {
              if (event.isComposing) return;
              if (vm.pickerOpen) {
                picker.keydown(event);
                if(event.defaultPrevented)return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!vm.busy) void vm.send();
              }
            }}
          />
      <DiscoveryPicker bind:this={picker} {vm} input={messageInput} {anchor} onSelected={selected} onAttach={()=>fileInput?.click()} onBrowse={()=>resourcesOpen=true} {onCreateGoal}/>
      {#if vm.attachments.length}<Attachment.Group class="w-full px-3" role="list" aria-label="Attachments" tabindex={0}>
        {#each vm.attachments as attachment (attachment.id)}<div role="listitem" class="flex w-56 shrink-0 snap-start flex-col gap-2">
          <Attachment.Root state={attachment.status === 'pending' ? 'uploading' : attachment.status === 'failed' ? 'error' : 'done'} class="w-full" aria-busy={attachment.status === 'pending'}>
            <Attachment.Media variant={attachment.asset?.mediaType.startsWith('image/') ? 'image' : 'icon'}>
              {#if attachment.asset?.mediaType.startsWith('image/')}<img src={'/api/assets/' + encodeURIComponent(attachment.asset.key)} alt={attachment.name} />{:else if attachment.status === 'pending'}<Spinner />{:else}<DocumentIcon />{/if}
            </Attachment.Media>
            <Attachment.Content>
              <Attachment.Title title={attachment.name}>{attachment.name}</Attachment.Title>
              <Attachment.Description>{(attachment.size / 1024).toFixed(1)} KB · {attachment.mediaType}</Attachment.Description>
              {#if attachment.status === 'pending'}<Attachment.Description role="status">Importing attachment</Attachment.Description>{/if}
            </Attachment.Content>
            <Attachment.Actions><Attachment.Action type="button" aria-label={`Remove ${attachment.name}`} onclick={() => vm.removeAttachment(attachment.id)}><CloseIcon aria-hidden="true" /></Attachment.Action></Attachment.Actions>
          </Attachment.Root>
          {#if attachment.asset && !attachment.asset.mediaType.startsWith('image/')}<Collapsible.Root><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Preview file</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><ArtifactViewer artifact={{ id: attachment.id, title: attachment.name, content: { kind: 'asset', asset: attachment.asset } }} /></Collapsible.Content></Collapsible.Root>{/if}
          {#if attachment.status === 'failed'}<p role="status" class="text-xs text-muted-foreground">{attachment.error}</p><StatefulButton variant="ghost" size="sm" disabled={vm.importing || !vm.canRetryAttachment(attachment.id)} onclick={() => vm.retryAttachment(attachment.id)}>Retry</StatefulButton>{:else if attachment.status === 'ready' && !attachment.mediaType.startsWith('image/') && !attachment.mediaType.startsWith('text/')}<p class="text-xs text-muted-foreground">Preview available; not a direct model input. Remove before sending.</p>{/if}
        </div>{/each}
      </Attachment.Group>{/if}
      <div class="flex w-full flex-wrap gap-2 px-3">
        {#each vm.conversationContextIds as id}<Button variant="secondary" size="sm" title="Shares up to 12 completed cached messages, limited to 8,000 characters. No files or permissions are shared." aria-label={`Remove conversation ${vm.state?.conversations.find(c=>c.id===id)?.title??id}`} onclick={()=>vm.removeConversationContext(id)}>{vm.state?.conversations.find(c=>c.id===id)?.title??'Unavailable conversation'} · Recent context<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each vm.selectedDiscoveries as selection}<Button variant="secondary" size="sm" aria-label={`Remove ${selection.name} from ${selection.origin}`} onclick={() => vm.removeDiscovery(selection.id)}>{selection.name} · {selection.origin}{selection.unavailable ? ' · unavailable' : ''}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each vm.contextIds as id}<Button variant="secondary" size="sm" aria-label={`Remove ${vm.contextLabel(id)}`} onclick={() => vm.toggleContext(id)}>{vm.contextLabel(id)}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each vm.selectedResources as resource}<Button variant="secondary" size="sm" aria-label={`Remove ${resource.title}`} onclick={() => vm.removeResource(resource.entryId, resource.resourceId)}>{resource.title} · {resource.source}<CloseIcon aria-hidden="true" /></Button>{/each}
      </div>
      {#if vm.state?.activeContext}<Collapsible.Root class="w-full px-3"><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Current app context</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">{vm.state.activeContext}</p></Collapsible.Content></Collapsible.Root>{/if}
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
              void vm.importFiles(fileInput.files);
              fileInput.value = "";
            }
          }}
        />
        <StatefulButton
          variant="ghost"
          size="icon"
          iconOnly
          pending={vm.importing}
          disabled={!vm.canExecute}
          pendingLabel="Importing attachments"
          aria-label="Add to message" title="Add files, skills or context"
          onclick={()=>void openAdd()}><PlusIcon aria-hidden="true" /></StatefulButton>
        <div class="composer-spacer"></div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <StatefulButton {...props} variant="ghost" class="rounded-full" aria-label="Execution review"
                disabled={vm.busy || Boolean(vm.state?.activeOperation)}
                pending={vm.pendingCommand?.kind === 'set_reviewer'} pendingLabel="Saving review mode">
                <ShieldIcon aria-hidden="true" /><span class="composer-review-label">{vm.conversation?.reviewer === 'delegated' ? 'Approve for me' : 'Ask me'}</span>
              </StatefulButton>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content side="top" align="end" sideOffset={8} class="w-96 viewport-menu rounded-xl p-2">
            <DropdownMenu.Label class="px-2 py-2 font-normal text-muted-foreground">How should actions be reviewed?</DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={vm.conversation?.reviewer ?? 'human'} onValueChange={(reviewer) => {
              if (vm.conversation && (reviewer === 'human' || reviewer === 'delegated'))
                void vm.command({ kind: 'set_reviewer', conversationId: vm.conversation.id, reviewer });
            }}>
              <DropdownMenu.RadioItem value="human" class="gap-3 p-2 pr-8">
                <HandIcon aria-hidden="true" /><span><span class="block">Ask for approval</span><span class="block text-sm text-muted-foreground">You decide when Codex requests approval.</span></span>
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="delegated" disabled={!vm.state?.controls.reviewerModes.includes('delegated')} class="gap-3 p-2 pr-8">
                <ShieldIcon aria-hidden="true" /><span><span class="block">Approve for me</span><span class="block text-sm text-muted-foreground">{vm.state?.controls.reviewerModes.includes('delegated') ? 'Codex reviews actions within your permissions.' : 'Not available with the current agent.'}</span></span>
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        {#if vm.conversation?.provider==='codex'}
          <CodexModelSelector selection={vm.conversation.modelSelection} disabled={vm.busy||Boolean(vm.state?.activeOperation)} onSelect={selection=>{if(vm.conversation)void vm.command({kind:'set_model',conversationId:vm.conversation.id,...(selection?{selection}:{})});}} />
        {/if}
        {#if vm.state?.activeOperation}<StatefulButton
            variant="ghost"
            size="icon"
            class="rounded-full"
            iconOnly
            pending={vm.pendingCommand?.kind === 'stop'}
            pendingLabel="Stopping"
            title={vm.state.controls.interrupt
              ? "Stop operation"
              : "Provider does not support interruption"}
            aria-label="Stop operation"
            disabled={!vm.state.controls.interrupt || vm.busy}
            onclick={() =>
              vm.state &&
              vm.command({ kind: "stop", conversationId: vm.state.selectedId })}
            ><StopIcon aria-hidden="true" /></StatefulButton
          >{/if}
        <StatefulButton
          type="submit"
          size="icon"
          class="rounded-full"
          iconOnly
          pending={vm.pendingCommand?.kind === 'send'}
          pendingLabel="Sending"
          aria-label={vm.state?.activeOperation
            ? "Steer operation"
            : "Send message"}
          title={vm.state?.activeOperation
            ? "Send a correction to the active operation"
            : "Send message"}
          disabled={!vm.canSend ||
            vm.busy ||
            vm.pickerOpen || vm.attachments.some(item => item.status !== 'ready') ||
            !vm.draft.trim() ||
            Boolean(vm.state?.activeOperation && !vm.state.controls.steer)}
          ><ArrowIcon aria-hidden="true" /></StatefulButton
        >
      </PromptInput.Actions>
      </PromptInput.Root>
    </Collapsible.Root>
  </form>
  </div>
  </div>
  <p class="composer-note text-muted-foreground">
    {vm.conversation?.reviewer === 'delegated' ? 'Codex reviews actions within your permissions. Review the work before using it.' : 'You review actions when required. Saving work does not accept it as finished.'}
  </p>
</div>
