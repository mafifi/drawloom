<script lang="ts">
  import {
    Alert,
    Button,
    Collapsible,
    Field,
    Input,
    InputGroup,
    StatefulButton,
    Select,
    Attachment,
    DocumentIcon,
    Spinner,
  } from "@drawloom/ui";
  import { CloseIcon, PlusIcon, StopIcon, ArrowIcon } from "@drawloom/ui";
  import type { DesktopViewModel } from "./view-model.svelte.js";
  import DiscoveryPicker from './DiscoveryPicker.svelte';
  import ArtifactViewer from './ArtifactViewer.svelte';
  let { vm }: { vm: DesktopViewModel } = $props();
  let fileInput = $state<HTMLInputElement | null>(null);
  let messageInput = $state<HTMLTextAreaElement | null>(null);
  function typedReference(event: Event) {
    const input = event.currentTarget as HTMLTextAreaElement;
    vm.draft = input.value;
    const end = input.selectionStart, match = /(?:^|\s)([$@])([^\s$@]*)$/.exec(input.value.slice(0, end));
    if (match) vm.openPicker(match[1] === '$' ? 'skill' : 'context', { start: end - match[2]!.length - 1, end });
  }
</script>

<div class="composer-area">
  {#if vm.error}<Alert.Root variant="destructive"
      ><Alert.Description>{vm.error}</Alert.Description></Alert.Root
    >{/if}
  {#if vm.canExecute && !vm.canSend}<p class="composer-note text-muted-foreground">
      Synthetic agent supports Text studio only. Local artifacts and review
      remain available. Select Codex for a model conversation; sending uses your
      account.
    </p>{/if}
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
      <InputGroup.Root variant="filled" class="relative">
          <InputGroup.Textarea
            id="message-draft"
            class="min-h-20 max-h-60 px-3 pt-3"
            placeholder="Ask or make a change…"
            disabled={!vm.canExecute}
            bind:value={vm.draft}
            bind:ref={messageInput}
            oninput={typedReference}
            onpaste={(event) => { const files = event.clipboardData?.files; if (files?.length) { event.preventDefault(); void vm.importFiles(files); } }}
            onkeydown={(event) => {
              if (event.isComposing) return;
              if (vm.pickerOpen) {
                if (event.key === "Escape") { event.preventDefault(); vm.pickerOpen = false; return; }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); vm.movePicker(event.key === "ArrowDown" ? 1 : -1); return; }
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); vm.selectActivePicker(); return; }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!vm.busy) void vm.send();
              }
            }}
          />
      <DiscoveryPicker {vm} />
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
        {#each vm.selectedDiscoveries as selection}<Button variant="secondary" size="sm" aria-label={`Remove ${selection.name} from ${selection.origin}`} onclick={() => vm.removeDiscovery(selection.id)}>{selection.name} · {selection.origin}{selection.unavailable ? ' · unavailable' : ''}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each vm.contextIds as id}<Button variant="secondary" size="sm" aria-label={`Remove ${vm.contextLabel(id)}`} onclick={() => vm.toggleContext(id)}>{vm.contextLabel(id)}<CloseIcon aria-hidden="true" /></Button>{/each}
        {#each vm.selectedResources as resource}<Button variant="secondary" size="sm" aria-label={`Remove ${resource.title}`} onclick={() => vm.removeResource(resource.entryId, resource.resourceId)}>{resource.title} · {resource.source}<CloseIcon aria-hidden="true" /></Button>{/each}
      </div>
      {#if vm.state?.activeContext}<Collapsible.Root class="w-full px-3"><Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" size="sm">Current app context</Button>{/snippet}</Collapsible.Trigger><Collapsible.Content><p class="whitespace-pre-wrap break-words text-sm text-muted-foreground">{vm.state.activeContext}</p></Collapsible.Content></Collapsible.Root>{/if}
      <InputGroup.Addon align="block-end" class="gap-1 flex-wrap">
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
          aria-label="Attach files"
          onclick={() => fileInput?.click()}><PlusIcon aria-hidden="true" /></StatefulButton
        >
        <Button variant="ghost" disabled={!vm.canExecute} aria-label="Choose a skill" onclick={() => vm.openPicker('skill')}>$ Skills</Button>
        <Button variant="ghost" disabled={!vm.canExecute} aria-label="Choose integrations and context" onclick={() => vm.openPicker('context')}>@ Context</Button>
        <div class="composer-spacer"></div>
        <Select.Root
          type="single"
          value={vm.conversation?.reviewer ?? 'human'}
          disabled={vm.busy || Boolean(vm.state?.activeOperation)}
          onValueChange={(reviewer) => {
            if (vm.conversation && (reviewer === 'human' || reviewer === 'delegated'))
              void vm.command({ kind: 'set_reviewer', conversationId: vm.conversation.id, reviewer });
          }}
        >
          <Select.Trigger variant="ghost" aria-label="Execution review"
            >{vm.conversation?.reviewer === 'delegated' ? 'Approve for me' : 'Ask me'}</Select.Trigger
          >
          <Select.Content><Select.Group>
            <Select.Item value="human" label="Ask me" />
            <Select.Item value="delegated" label="Approve for me" disabled={!vm.state?.controls.reviewerModes.includes('delegated')} />
          </Select.Group></Select.Content>
        </Select.Root>
        <Select.Root
          type="single"
          value={vm.conversation?.provider ?? "synthetic"}
          disabled={vm.busy || Boolean(vm.state?.activeOperation)}
          onValueChange={(value) => {
            if (value === "synthetic" || value === "codex")
              void vm.create(vm.conversation?.workbenchId, value, 'provider');
          }}
        >
          <Select.Trigger variant="ghost" aria-label="Agent provider"
            >{vm.conversation?.provider === "codex"
              ? "Codex"
              : "Synthetic"}</Select.Trigger
          >
          <Select.Content
            ><Select.Group
              ><Select.Item value="synthetic" label="Synthetic" /><Select.Item
                value="codex"
                label="Codex"
              /></Select.Group
            ></Select.Content
          >
        </Select.Root>
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
      </InputGroup.Addon>
      </InputGroup.Root>
    </Collapsible.Root>
  </form>
  <p class="composer-note text-muted-foreground">
    {vm.conversation?.reviewer === 'delegated' ? 'Codex reviews actions within your permissions. Review the work before using it.' : 'You review actions when required. Saving work does not accept it as finished.'}
  </p>
</div>
