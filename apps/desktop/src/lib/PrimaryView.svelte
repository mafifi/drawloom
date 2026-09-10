<script lang="ts">
  import { Button, Checkbox, Field, Input, Separator, StatefulButton } from '@drawloom/ui';
  import DiscoveryInventory from './DiscoveryInventory.svelte';
  import DetailsPane from './DetailsPane.svelte';
  import type { DesktopViewModel } from './view-model.svelte.js';
  let { vm, artifact = false }: { vm: DesktopViewModel; artifact?: boolean } = $props();
</script>

<main class="primary-view">
  <header class="primary-view-header">
    <Button variant="ghost" onclick={() => { vm.primaryView = 'conversation'; if (artifact) vm.detailsOpen = false; }}>← Back to conversation</Button>
    <h1>{artifact ? (vm.artifact?.title ?? 'Artifacts') : vm.primaryView === 'plugins' ? 'Plugins' : 'Settings'}</h1>
  </header>
  <Separator />
  {#if artifact}
    <DetailsPane {vm} embedded />
  {:else if vm.primaryView === 'plugins'}
    <div class="primary-view-content"><DiscoveryInventory {vm} /></div>
  {:else}
    <section class="primary-view-content preview">
      <h2>Local workspace</h2>
      <p>Project records stay in the host’s selected data directory.</p>
      <h2>Workbench configuration</h2>
      <p class="text-muted-foreground">{vm.state?.operator.summary}</p>
      <h2>Experimental native plugin catalogue</h2>
      <p class="text-muted-foreground">{vm.catalogue?.experimentalPluginDiscovery ? 'Enabled for this host.' : 'Off by default.'} This read-only catalogue does not grant execution permission. To change it, set <code>DRAWLOOM_EXPERIMENTAL_PLUGIN_DISCOVERY=1</code> at host startup and restart the local host; there is no in-app configuration toggle.</p>
      {#each vm.state?.operator.configuration ?? [] as field}
        <form onsubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = typeof field.value === 'boolean' ? data.get('value') === 'on' : typeof field.value === 'number' ? Number(data.get('value')) : String(data.get('value'));
          void vm.operator({ kind: 'configure', key: field.key, value });
        }}>
          <Field.Group><Field.Field><Field.Label for={'config-' + field.key}>{field.label}</Field.Label>
            {#if typeof field.value === 'boolean'}<Checkbox id={'config-' + field.key} name="value" checked={field.value} />{:else}<Input id={'config-' + field.key} name="value" type={typeof field.value === 'number' ? 'number' : 'text'} value={String(field.value)} />{/if}
            <StatefulButton type="submit" pending={vm.pendingCommand?.kind === 'operator' && vm.pendingCommand.command.kind === 'configure' && vm.pendingCommand.command.key === field.key} variant="outline" class="w-fit" disabled={vm.busy}>Save</StatefulButton>
          </Field.Field></Field.Group>
        </form>
      {/each}
      <Field.Set><Field.Legend>Tool grants</Field.Legend><Field.Description>Installing or configuring a plugin does not allow its tools to run.</Field.Description><Field.Group>
        {#each vm.state?.operator.grants ?? [] as grant}
          {@const label = vm.state?.toolLabels.find(tool => tool.toolName === grant.toolName)}
          <Field.Field orientation="horizontal" data-disabled={vm.busy}><Checkbox id={'grant-' + grant.toolName} checked={grant.allowed} disabled={vm.busy} onCheckedChange={(checked) => vm.operator({ kind: 'set_tool_grant', toolName: grant.toolName, allowed: checked })} /><Field.Label for={'grant-' + grant.toolName}>{label ? `${label.title} · ${label.origin}` : grant.toolName}</Field.Label></Field.Field>
        {/each}
      </Field.Group></Field.Set>
    </section>
  {/if}
</main>
