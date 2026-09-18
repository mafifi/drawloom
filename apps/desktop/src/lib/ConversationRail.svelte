<script lang="ts">
  import { Button, Tooltip } from '@drawloom/ui';
  import type { ConversationTurn } from './conversation-scroll.js';
  let { items, activeId, navigate }: { items: ConversationTurn[]; activeId: string; navigate: (id: string) => void } = $props();
  let preview = $state(-1);
</script>

{#if items.length > 1}
  <nav class="conversation-rail" aria-label="Conversation turns in loaded history">
    <div class="conversation-rail-scroll scroll-fade scroll-fade-4">
      <Tooltip.Provider delayDuration={150}>
        {#each items as item, index (item.id)}
          <Tooltip.Root onOpenChange={(open) => { preview = open ? index : -1; }}>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" class="conversation-turn h-3 min-h-3 w-9 px-1.5 py-0 justify-start rounded-sm [@media(pointer:coarse)]:h-7" aria-label={`Jump to message: ${item.prompt}`} aria-current={activeId === item.id ? 'location' : undefined}
                  onclick={() => navigate(item.id)}>
                  <span aria-hidden="true" style:width={`${preview < 0 ? 7 : Math.max(7, 24 - Math.abs(preview - index) * 6)}px`}></span>
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content side="right" sideOffset={8} class="conversation-turn-preview bg-popover text-popover-foreground p-3" arrowClasses="hidden">
              <div><p>{item.prompt}</p>{#if item.response}<p class="text-muted-foreground mt-2">{item.response}</p>{/if}</div>
            </Tooltip.Content>
          </Tooltip.Root>
        {/each}
      </Tooltip.Provider>
    </div>
  </nav>
{/if}
