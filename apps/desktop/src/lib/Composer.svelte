<script lang="ts">
  import {
    Alert,
    Button,
    Checkbox,
    Collapsible,
    Empty,
    Field,
    Input,
    InputGroup,
    StatefulButton,
    Select,
  } from "@drawloom/ui";
  import { CloseIcon, PlusIcon, DocumentIcon, StopIcon, ArrowIcon } from "@drawloom/ui";
  import type { DesktopViewModel } from "./view-model.svelte.js";
  export let vm: DesktopViewModel;
  let fileInput: HTMLInputElement | null = null;
</script>

<div class="composer-area">
  {#if vm.error}<Alert.Root variant="destructive"
      ><Alert.Description>{vm.error}</Alert.Description></Alert.Root
    >{/if}
  {#if !vm.canSend}<p class="composer-note text-muted-foreground">
      Synthetic agent supports Text studio only. Local artifacts and review
      remain available. Select Codex for a model conversation; sending uses your
      account.
    </p>{/if}
  <form
    class="composer"
    onsubmit={(event) => {
      event.preventDefault();
      void vm.send();
    }}
  >
    <Collapsible.Root bind:open={vm.contextOpen}>
      <Field.Label for="message-draft" class="sr-only">Message</Field.Label>
      <InputGroup.Root variant="filled">
          <InputGroup.Textarea
            id="message-draft"
            class="min-h-20 max-h-60 px-3 pt-3"
            placeholder="Ask or make a change…"
            bind:value={vm.draft}
            onkeydown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!vm.busy) void vm.send();
              }
            }}
          />
      {#if vm.attachmentKeys.length}
        <div class="attachment-list flex flex-wrap gap-2">
          {#each vm.attachmentKeys as key}<Button
              variant="secondary"
              size="sm"
              onclick={() => vm.removeAttachment(key)}
              aria-label={`Remove ${vm.attachmentName(key)}`}
              >{vm.attachmentName(key)}<CloseIcon aria-hidden="true" /></Button
            >{/each}
        </div>
      {/if}
      <Collapsible.Content class="context-picker">
        <Field.Set
          ><Field.Legend class="sr-only">Document context</Field.Legend
          ><Field.Description
            >Include a text document as reference material.</Field.Description
          ><Field.Group>
            {#each vm.state?.operator.artifacts.filter((a) => a.content.kind === "text") ?? [] as artifact}
              <Field.Field orientation="horizontal"
                ><Checkbox
                  id={`context-${artifact.id}`}
                  checked={vm.contextIds.includes(artifact.id)}
                  onCheckedChange={() => vm.toggleContext(artifact.id)}
                /><Field.Label for={`context-${artifact.id}`}
                  >{vm.contextLabel(artifact.id)}</Field.Label
                ></Field.Field
              >
            {:else}<Empty.Root
                ><Empty.Description>No text documents yet.</Empty.Description
                ></Empty.Root
              >{/each}
          </Field.Group></Field.Set
        >
      </Collapsible.Content>
      <InputGroup.Addon align="block-end" class="gap-1">
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
          pendingLabel="Importing attachments"
          aria-label="Attach files"
          onclick={() => fileInput?.click()}><PlusIcon aria-hidden="true" /></StatefulButton
        >
        <Collapsible.Trigger>
          {#snippet child({ props })}<Button {...props} variant="ghost"
              ><DocumentIcon aria-hidden="true" />Context{vm.contextIds.length
                ? ` (${vm.contextIds.length})`
                : ""}</Button
            >{/snippet}
        </Collapsible.Trigger>
        <div class="composer-spacer"></div>
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
            !vm.draft.trim() ||
            Boolean(vm.state?.activeOperation && !vm.state.controls.steer)}
          ><ArrowIcon aria-hidden="true" /></StatefulButton
        >
      </InputGroup.Addon>
      </InputGroup.Root>
    </Collapsible.Root>
  </form>
  <p class="composer-note text-muted-foreground">
    Review changes before using them.
  </p>
</div>
