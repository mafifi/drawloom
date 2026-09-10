<script lang="ts">
  import { Alert, Badge, Button, Collapsible, Empty, Field, Input, StatefulButton } from '@drawloom/ui';
  import type { DesktopViewModel } from './view-model.svelte.js';
  import PackageInstallations from './PackageInstallations.svelte';
  let { vm }: { vm: DesktopViewModel } = $props();
</script>

<section class="preview flex flex-col gap-3">
  <PackageInstallations />
  <Field.Field><Field.Label for="catalogue-search">Find plugins, apps, tools and skills</Field.Label><Input id="catalogue-search" placeholder="Search contributions…" bind:value={vm.catalogueQuery} /></Field.Field>
  <StatefulButton variant="outline" pending={vm.cataloguePending} pendingLabel="Refreshing discovery" onclick={() => vm.refreshCatalogue(true)}>Refresh discovery</StatefulButton>
  {#if vm.catalogueError}<Alert.Root variant="destructive"><Alert.Description>{vm.catalogueError}</Alert.Description></Alert.Root>{/if}
  {#each vm.catalogue?.categories ?? [] as category}<p class="text-sm text-muted-foreground">{category.kind}: {category.message ?? category.status}</p>{/each}
  <p class="text-sm text-muted-foreground" role="status">Showing {vm.filteredCatalogue.length} of {vm.catalogueMatchCount} matching contributions.</p>
  {#if vm.catalogue?.nextCursor}<p class="text-sm text-muted-foreground">More apps are available. Search covers loaded results.</p><StatefulButton variant="outline" pending={vm.cataloguePending} pendingLabel="Loading apps" onclick={() => vm.loadMoreApps()}>Load more apps</StatefulButton>{/if}
  {#each vm.filteredCatalogue as entry (entry.id)}
    <Collapsible.Root>
      <Collapsible.Trigger>{#snippet child({ props })}<Button {...props} variant="ghost" class="h-auto w-full justify-between py-2"><span class="min-w-0 text-left">{entry.name}<span class="block text-xs text-muted-foreground">{entry.origin} · {entry.kind}</span></span><Badge variant="outline">{entry.availability}</Badge></Button>{/snippet}</Collapsible.Trigger>
      <Collapsible.Content class="flex flex-col gap-2 px-2 pb-3">
        <p>{entry.description || 'No description supplied.'}</p><p class="text-sm text-muted-foreground">Scope: {entry.scope}{entry.selectable ? ' · Can be selected for a message' : ' · Inventory only'}</p>
        {#if entry.ownerId}<p class="text-sm text-muted-foreground">Contributed by {vm.contributionOwner(entry.ownerId)?.name ?? entry.ownerId}</p>{/if}
        {#if entry.authenticationOwner === 'provider'}
          <p class="text-sm text-muted-foreground">Codex owns this connection and its credentials. Sign-in does not grant tool permissions. Refresh discovery after completing sign-in.</p>
          <StatefulButton variant="outline" pending={vm.integrationIsPending(entry.id)} pendingLabel="Starting Codex sign-in" onclick={() => vm.authenticateIntegration(entry.id)}>Connect through Codex</StatefulButton>
          {#if vm.integrationAuthorizationUrl(entry.id)}<Button href={vm.integrationAuthorizationUrl(entry.id)} target="_blank" rel="noopener noreferrer" variant="link">Continue sign-in in browser</Button>{/if}
          {#if vm.integrationError(entry.id)}<Alert.Root variant="destructive"><Alert.Description>{vm.integrationError(entry.id)}</Alert.Description></Alert.Root>{/if}
        {/if}
        {#each vm.contributionsFor(entry.id) as child}<p class="text-sm">{child.kind}: {child.name} · {child.availability}</p>{/each}
        {#if vm.contributionCount(entry.id)}<p class="text-sm text-muted-foreground">Showing {vm.contributionsFor(entry.id).length} of {vm.contributionCount(entry.id)} contributions.</p>{/if}
        {#if vm.contributionsFor(entry.id).length < vm.contributionCount(entry.id)}<Button variant="ghost" size="sm" onclick={() => vm.showMoreContributions(entry.id)}>Load more contributions from {entry.name}</Button>{/if}
      </Collapsible.Content>
    </Collapsible.Root>
  {:else}<Empty.Root><Empty.Description>{vm.cataloguePending ? 'Loading contributions…' : 'No matching contributions.'}</Empty.Description></Empty.Root>{/each}
  {#if vm.filteredCatalogue.length < vm.catalogueMatchCount}<Button variant="outline" onclick={() => vm.showMoreCatalogue()}>Load more contributions</Button>{/if}
  {#each vm.state?.plugins ?? [] as plugin}<p class="text-sm text-muted-foreground">{plugin.id} · {plugin.status} · {plugin.summary}</p>{/each}
  <p class="text-sm text-muted-foreground">Trusted packages are configured by the local host at startup. Native plugin discovery is experimental and {vm.catalogue?.experimentalPluginDiscovery ? 'enabled for this host' : 'off; it requires explicit host opt-in'}.</p>
  <p class="text-sm text-muted-foreground">Listing or selecting a contribution does not grant execution permission. Tool grants and review remain independent.</p>
</section>
