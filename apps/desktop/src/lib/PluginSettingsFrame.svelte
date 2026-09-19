<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert } from '@drawloom/ui';
  import { attachSettingsFrame } from './plugin-settings-frame.js';
  import type { SettingsPage } from './plugin-settings-protocol.js';
  let { page }: { page: SettingsPage } = $props();
  let frame: HTMLIFrameElement;
  let status = $state<'loading' | 'ready' | 'failed'>('loading');
  onMount(() => attachSettingsFrame(frame, page, value => status = value));
</script>
{#if status === 'loading'}<p role="status" class="text-muted-foreground">Opening settings…</p>{/if}
{#if status === 'failed'}<Alert.Root variant="destructive"><Alert.Description>Settings could not connect. Reopen this page to inspect current state.</Alert.Description></Alert.Root>{/if}
<iframe bind:this={frame} title={`${page.ownerTitle}: ${page.title}`} sandbox="allow-scripts" referrerpolicy="no-referrer" class="hosted-view-frame" hidden={status === 'failed'}></iframe>
