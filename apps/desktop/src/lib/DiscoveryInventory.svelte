<script lang="ts">
  import { Alert, Badge, Button, Collapsible, Empty, Field, Input, StatefulButton, Tabs, PlugIcon, ChevronRightIcon, SearchIcon, PresentationIcon } from '@drawloom/ui';
  import type { DiscoveryInventoryActions, DiscoveryInventoryPresentation } from './discovery-inventory.js';
  import PackageInstallations from './PackageInstallations.svelte';
  import { pluginGroups, discoveryName, readableName, pluginDescription } from './screen-language.js';
  let { presentation, actions }: { presentation: DiscoveryInventoryPresentation; actions: DiscoveryInventoryActions } = $props();
  let selectedId = $state(''), limit = $state(30);
  const groups = $derived(pluginGroups(presentation.catalogue?.entries ?? [], presentation.catalogueQuery));
  const selected = $derived(groups.find(group => group.entry.id === selectedId));
</script>

<Tabs.Root value="browse" class="space-y-8">
  <Tabs.List aria-label="Plugin sections"><Tabs.Trigger value="browse">Your plugins</Tabs.Trigger><Tabs.Trigger value="install">Install & configure</Tabs.Trigger></Tabs.List>
  <Tabs.Content value="browse" class="space-y-6">
    <div class="screen-toolbar">
      <Field.Field><Field.Label class="sr-only" for="catalogue-search">Search plugins</Field.Label><Input id="catalogue-search" placeholder="Search plugins and their tools…" value={presentation.catalogueQuery} oninput={event => actions.setQuery(event.currentTarget.value)} /></Field.Field>
      <StatefulButton variant="ghost" pending={presentation.cataloguePending} pendingLabel="Refreshing" onclick={() => actions.refresh(true)}>Refresh</StatefulButton>
    </div>
    {#if presentation.catalogueError}<Alert.Root variant="destructive"><Alert.Title>Some plugins could not be loaded</Alert.Title><Alert.Description>{presentation.catalogueError}</Alert.Description></Alert.Root>{/if}
    {#if presentation.catalogue?.categories.some(c => c.status !== 'available')}
      <Collapsible.Root><Collapsible.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="sm">Some discovery results are incomplete <ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger><Collapsible.Content class="text-sm text-muted-foreground space-y-2 py-3">{#each presentation.catalogue?.categories ?? [] as category}<p>{category.message ?? category.status}</p>{/each}</Collapsible.Content></Collapsible.Root>
    {/if}
    <div class:collection-detail={Boolean(selected)}>
    <section class="item-list" aria-label="Your plugins">
      {#each groups.slice(0,limit) as group (group.entry.id)}
        <Button variant="ghost" class="collection-row" aria-pressed={selectedId === group.entry.id} onclick={() => selectedId = group.entry.id}>
          <PresentationIcon icon={group.entry.presentation?.icon} class="size-5 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 text-left"><span class="block truncate">{discoveryName(group.entry)}</span><span class="block truncate text-sm text-muted-foreground">{pluginDescription(group.entry)}</span></span>
          <Badge variant="outline">{group.entry.availability === 'available' ? 'Available' : group.entry.availability.replaceAll('_',' ')}</Badge>
          <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground" />
        </Button>
      {:else}<Empty.Root><Empty.Header><Empty.Media variant="icon"><PlugIcon /></Empty.Media><Empty.Title>{presentation.cataloguePending ? 'Loading plugins' : 'No matching plugins'}</Empty.Title><Empty.Description>{presentation.cataloguePending ? 'Your connections will appear here.' : 'Try another search, or install a plugin from a local folder.'}</Empty.Description></Empty.Header></Empty.Root>{/each}
      {#if groups.length > limit}<Button variant="ghost" onclick={() => limit += 30}>Show more</Button>{/if}
      {#if presentation.catalogue?.nextCursor}<StatefulButton variant="outline" pending={presentation.cataloguePending} onclick={() => actions.loadMoreApps()}>Load more apps</StatefulButton>{/if}
    </section>
    {#if selected}
      {@const entry=selected.entry}
      <section class="selected-detail space-y-6" aria-label={'About ' + discoveryName(entry)}>
        <header class="flex items-center justify-between gap-3"><h2>{discoveryName(entry)}</h2><Button variant="ghost" size="sm" onclick={() => selectedId=''}>Close</Button></header>
        <p class="text-muted-foreground">{pluginDescription(entry)}</p>
        <p class="text-sm text-muted-foreground">{entry.origin}</p>
        {#if entry.authenticationOwner === 'provider'}
          <StatefulButton variant="outline" pending={actions.integrationIsPending(entry.id)} pendingLabel="Opening sign-in" onclick={() => actions.authenticateIntegration(entry.id)}>Connect through Codex</StatefulButton>
          {#if actions.integrationAuthorizationUrl(entry.id)}<Button href={actions.integrationAuthorizationUrl(entry.id)} target="_blank" rel="noopener noreferrer" variant="link">Continue sign-in</Button>{/if}
          {#if actions.integrationError(entry.id)}<Alert.Root variant="destructive"><Alert.Description>{actions.integrationError(entry.id)}</Alert.Description></Alert.Root>{/if}
        {/if}
        {#if selected.children.length}
          <section class="space-y-3"><h3>Tools & skills</h3>
            {#each actions.contributionsFor(entry.id) as child}<div class="flex flex-col gap-1 py-2"><span>{readableName(child.name)}{#if child.scope==='app-only'} <Badge variant="outline">App only</Badge>{/if}</span><span class="text-sm text-muted-foreground">{child.description || child.kind} · {child.availability}</span></div>{/each}
            {#if actions.contributionsFor(entry.id).length < actions.contributionCount(entry.id)}<Button variant="ghost" onclick={() => actions.showMoreContributions(entry.id)}>Show more tools & skills</Button>{/if}
          </section>
        {/if}
        <Collapsible.Root><Collapsible.Trigger>{#snippet child({props})}<Button {...props} variant="ghost" size="sm">Technical details <ChevronRightIcon class="size-4" /></Button>{/snippet}</Collapsible.Trigger><Collapsible.Content class="space-y-2 py-3 text-sm text-muted-foreground"><p class="break-all">{entry.name}</p><p>{entry.kind} · {entry.scope}</p><p>{entry.selectable ? 'Can be selected for a message.' : 'Not selectable for a message.'}</p><p>Connection does not change tool permissions.</p></Collapsible.Content></Collapsible.Root>
      </section>
    {/if}
    </div>
  </Tabs.Content>
  <Tabs.Content value="install"><PackageInstallations /></Tabs.Content>
</Tabs.Root>
