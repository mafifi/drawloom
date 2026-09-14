<script lang="ts">
  import { Sidebar, ContextMenu, StatefulButton, PinIcon, PinOffIcon, ArchiveIcon, RenameIcon } from '@drawloom/ui';
  export interface ConversationNavPresentation {
    title: string; projectName: string; active: boolean; pinned: boolean;
    busy: boolean; archiveBlocked: boolean; pending?: 'open' | 'pin' | 'archive';
  }
  export interface ConversationNavActions { open(): void; rename(): void; pin(): void; archive(): void; }
  let { presentation: p, actions: a }: { presentation: ConversationNavPresentation; actions: ConversationNavActions } = $props();
</script>

<Sidebar.MenuItem>
  <ContextMenu.Root>
    <ContextMenu.Trigger class="sidebar-conversation-row flex min-w-0 items-center rounded-md" aria-label={'Actions for ' + p.title} tabindex={0}>
      <Sidebar.MenuButton class="min-w-0 flex-1 justify-start pl-8" isActive={p.active} title={p.title + ' · ' + p.projectName}>
        {#snippet child({ props })}<StatefulButton {...props} variant="ghost" disabled={p.busy} pending={p.pending === 'open'} pendingLabel="Opening" onclick={a.open}><span class="truncate">{p.title}</span></StatefulButton>{/snippet}
      </Sidebar.MenuButton>
      <StatefulButton variant="ghost" size="icon" class={p.pinned ? 'size-7 shrink-0' : 'sidebar-reveal size-7 shrink-0'} aria-label={(p.pinned ? 'Unpin ' : 'Pin ') + p.title} title={p.pinned ? 'Unpin conversation' : 'Pin conversation'} disabled={p.busy} pending={p.pending === 'pin'} pendingLabel="Saving pin" onclick={a.pin}>{#if p.pinned}<PinOffIcon aria-hidden="true" />{:else}<PinIcon aria-hidden="true" />{/if}</StatefulButton>
      <StatefulButton variant="ghost" size="icon" class="sidebar-reveal size-7 shrink-0" aria-label={'Archive ' + p.title} title={p.archiveBlocked ? 'Archive unavailable while work or approval is pending' : 'Archive conversation'} disabled={p.busy || p.archiveBlocked} pending={p.pending === 'archive'} pendingLabel="Archiving" onclick={a.archive}><ArchiveIcon aria-hidden="true" /></StatefulButton>
    </ContextMenu.Trigger>
    <ContextMenu.Content class="w-56">
      <ContextMenu.Item disabled={p.busy} onclick={a.rename}><RenameIcon aria-hidden="true" />Rename</ContextMenu.Item>
      <ContextMenu.Item disabled={p.busy} onclick={a.pin}><PinIcon aria-hidden="true" />{p.pinned ? 'Unpin' : 'Pin'}</ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item disabled={p.busy || p.archiveBlocked} onclick={a.archive}><ArchiveIcon aria-hidden="true" />{p.archiveBlocked ? 'Archive unavailable while work is pending' : 'Archive'}</ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
</Sidebar.MenuItem>
