<script lang="ts" module>
  export interface ModelOption {id:string;title:string;provider:string;local:boolean;description?:string;disabled?:boolean;efforts?:readonly string[];}
</script>
<script lang="ts">
  import {Popover, Slider} from 'bits-ui';
  import * as Command from '../command/index.js';
  import Button from '../button/button.svelte';
  import Cloud from '@lucide/svelte/icons/cloud';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  let {options,value='',effort='',label='Model',placeholder='Choose a model',loading=false,error='',disabled=false,onOpen,onSelect,onEffort}: {
    options:readonly ModelOption[];value?:string;effort?:string;label?:string;placeholder?:string;loading?:boolean;error?:string;disabled?:boolean;
    onOpen?:()=>void;onSelect:(id:string)=>void;onEffort?:(effort:string)=>void;
  }=$props();
  let open=$state(false);
  let showingModels=$state(false);
  let draftEffort=$state(0);
  const selected=$derived(options.find(m=>m.id===value));
  const levels=$derived(selected?.efforts??[]);
  $effect(()=>{draftEffort=Math.max(0,levels.indexOf(effort));});
</script>
<Popover.Root bind:open onOpenChange={next=>{if(next){showingModels=!onEffort;onOpen?.();}}}>
  <Popover.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" {disabled} aria-label={label} data-model-selector-trigger title={`${selected?.title??placeholder}${effort?' · '+effort:''}`} class="min-w-0 max-w-full gap-2">
    {#if selected?.local}<Cpu class="size-4 shrink-0" />{:else}<Cloud class="size-4 shrink-0" />{/if}
    <span class="truncate">{selected?.title ?? (value || placeholder)}</span>{#if effort}<span data-model-effort-label class="text-muted-foreground capitalize">{effort}</span>{/if}<ChevronDown class="size-3 shrink-0" />
  </Button>{/snippet}</Popover.Trigger>
  <Popover.Portal><Popover.Content side="top" align="end" sideOffset={8} class={`z-50 ${showingModels?'w-80':'w-64'} max-w-[calc(100vw-2rem)] rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md outline-none`}>
    {#if !showingModels && onEffort}
      <div class="space-y-3 p-3">
        <div class="flex items-start justify-center"><div class="min-w-0 text-center"><p class="text-sm font-medium capitalize text-primary">{levels.length ? levels[draftEffort] : 'Provider default'}</p><Button variant="ghost" size="sm" class="h-auto max-w-full p-0 text-xs text-muted-foreground" onclick={()=>{showingModels=true;}}><span class="truncate">{selected?.title??placeholder}</span><ChevronRight class="size-3" /></Button></div></div>
        {#if levels.length>1}
          <Slider.Root type="single" min={0} max={levels.length-1} step={1} bind:value={draftEffort} {disabled} onValueCommit={index=>{const next=levels[index];if(next && next!==effort)onEffort?.(next);}} class="relative flex h-8 w-full touch-none items-center select-none rounded-full bg-accent">
            {#snippet children({tickItems})}<span aria-hidden="true" class="absolute h-full rounded-full" style:width={`calc(1.75rem + (100% - 1.75rem) * ${draftEffort/(levels.length-1)})`} style:background="linear-gradient(to right,var(--effort-fill-start),var(--effort-fill-end))"></span>{#each tickItems as tick}<Slider.Tick index={tick.index} class="absolute size-1 rounded-full bg-muted-foreground/60" />{/each}<Slider.Thumb index={0} aria-label="Reasoning effort" aria-valuetext={levels[draftEffort]} class="z-10 block size-7 rounded-full bg-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover" />{/snippet}
          </Slider.Root>
        {:else if !levels.length}<p class="text-xs text-muted-foreground">Choose a model to adjust effort.</p>{/if}
        {#if loading}<p role="status" class="text-xs text-muted-foreground">Loading models…</p>{/if}
        {#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
      </div>
    {:else}
    {#if onEffort}<Button variant="ghost" size="sm" class="m-1" onclick={()=>{showingModels=false;}}><ArrowLeft class="size-4" />Back to effort</Button>{/if}
    <Command.Root>
      <Command.Input placeholder="Search models…" aria-label="Search models" />
      {#if loading}<p role="status" class="px-3 py-2 text-sm text-muted-foreground">Loading models…</p>{/if}
      {#if error}<p role="alert" class="px-3 py-2 text-sm text-destructive">{error}</p>{/if}
      <Command.List class="max-h-64"><Command.Empty>No matching models</Command.Empty>
        {#each [...new Set(options.map(m=>m.provider))] as provider}<Command.Group heading={provider}>
          {#each options.filter(m=>m.provider===provider) as model (model.id)}
            <Command.Item value={model.id} keywords={[model.title,provider]} disabled={model.disabled} onSelect={()=>{onSelect(model.id);open=false;}} class="gap-3 px-3 py-2">
              {#if model.local}<Cpu class="size-4 shrink-0" />{:else}<Cloud class="size-4 shrink-0" />{/if}
              <span class="min-w-0 flex-1"><span class="block truncate">{model.title}</span>{#if model.description}<span class="block truncate text-xs text-muted-foreground">{model.description}</span>{/if}</span>
              {#if value===model.id}<Check class="size-4 shrink-0" aria-label="Selected" />{/if}
            </Command.Item>
          {/each}
        </Command.Group>{/each}
      </Command.List>
    </Command.Root>
    {/if}
  </Popover.Content></Popover.Portal>
</Popover.Root>
