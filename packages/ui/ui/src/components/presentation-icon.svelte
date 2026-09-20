<script lang="ts">
  import type { Snippet } from 'svelte';
  import Plug from '@lucide/svelte/icons/plug';
  let { icon, fallback, class: className = 'size-4 shrink-0' }: {
    icon?: { light: string; dark?: string }; fallback?: Snippet; class?: string;
  } = $props();
  let light = $state(''), dark = $state('');
  let lightFailed = $state(false), darkFailed = $state(false);
  $effect(() => {
    const urls: string[] = [];
    const resolve = (source?: string) => {
      if (!source || source.length > 350000) return '';
      const parsed = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
      if (!parsed) return '';
      try {
        const bytes = Uint8Array.from(atob(parsed[2]!), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: parsed[1] }));
        urls.push(url); return url;
      } catch { return ''; }
    };
    light = resolve(icon?.light); dark = resolve(icon?.dark);
    lightFailed = false; darkFailed = false;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  });
</script>
<span class={className} aria-hidden="true">
  {#snippet missing()}{#if fallback}{@render fallback()}{:else}<Plug class="size-full" />{/if}{/snippet}
  {#if dark && !darkFailed}
    <img src={dark} alt="" class="hidden size-full object-contain dark:block" onerror={() => darkFailed = true} />
  {/if}
  <span class={dark && !darkFailed ? 'block size-full dark:hidden' : 'block size-full'}>
    {#if light && !lightFailed}<img src={light} alt="" class="size-full object-contain" onerror={() => lightFailed = true} />{:else}{@render missing()}{/if}
  </span>
</span>
