<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert } from '@drawloom/ui';
  import { PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
  import { createPluginViewSession } from './plugin-view-session.js';
  import type { RegisteredWorkbenchView } from '@drawloom/plugins';
  import { closePluginViewBridge, createPluginViewBridge, updatePluginViewTheme } from './plugin-view-bridge.js';

  let {
    view,
    conversationId,
    generation,
    onmounted,
  }: {
    view: RegisteredWorkbenchView;
    conversationId: string;
    generation: number;
    onmounted: (mediaRevision: string, generation: number) => void;
  } = $props();
  let frame: HTMLIFrameElement;
  let failed = $state(false);
  let teardown = $state((_node: Element) => ({ duration: 0 }));

  onMount(() => {
    const source = frame.contentWindow!;
    const target = { viewId: view.id, conversationId };
    const appearance = matchMedia('(prefers-color-scheme: dark)');
    const theme = () => appearance.matches ? 'dark' as const : 'light' as const;
    const abort = new AbortController();
    const session = createPluginViewSession({ target, signal: abort.signal });
    const mount = session.opened.then(opened => {
      if (!abort.signal.aborted) onmounted(opened.mediaRevision, generation);
      return opened.mountId;
    });
    const release = () => session.release();
    const bridge = createPluginViewBridge({ theme: theme(),
      message: params => session.interact({ method: 'ui/message', params }),
      updateContext: params => session.interact({ method: 'ui/update-model-context', params }),
      callTool: request => session.callTool(request),
    });
    // Keep the iframe alive for the bounded standard cleanup exchange, including
    // when an ancestor pane/conversation is removed. No new calls while closing.
    teardown = () => {
      abort.abort();
      release();
      frame.style.pointerEvents = 'none';
      void closePluginViewBridge(bridge);
      // A real keyframe keeps Chromium advancing the bounded outro even after
      // Playwright has disabled animations for a preceding screenshot.
      return { duration: 300, css: (t: number) => `opacity: ${t}` };
    };
    const updateTheme = () => { updatePluginViewTheme(bridge, abort.signal, theme()); };
    let loads = 0;
    const loaded = () => {
      if (++loads > 1) {
        failed = true; void bridge.close(); abort.abort();
        release();
      }
      else updateTheme();
    };
    appearance.addEventListener('change', updateTheme);
    frame.addEventListener('load', loaded);
    // Install parent checks before navigation can execute the plugin's script.
    void mount.then(() => bridge.connect(new PostMessageTransport(source, source))).then(() => {
      if (!abort.signal.aborted) frame.src = '/api/views/' + encodeURIComponent(view.id) + '?conversationId=' + encodeURIComponent(conversationId);
    }).catch(() => { failed = true; });
    return () => { void bridge.close(); abort.abort(); release(); appearance.removeEventListener('change', updateTheme); frame.removeEventListener('load', loaded); };
  });
</script>

{#if failed}<Alert.Root variant="destructive"><Alert.Description>The view navigated away and was disconnected. Reopen it to inspect current state.</Alert.Description></Alert.Root>{/if}
<iframe bind:this={frame} out:teardown|global title={view.title} sandbox="allow-scripts" referrerpolicy="no-referrer" class="hosted-view-frame" hidden={failed}></iframe>
