<script lang="ts">
  import { onMount } from 'svelte';
  import { Alert, Badge, Checkbox, Collapsible, Field, Input, Separator, StatefulButton, Textarea } from '@drawloom/ui';
  import { createPackageViewModel } from './package-view-model.svelte.js';
  const vm = createPackageViewModel();
  const connectionActions = ['connect', 'status', 'cancel', 'reconnect', 'disconnect'] as const;
  onMount(() => { void vm.refresh(); });
</script>

<section class="flex flex-col gap-3" aria-label="Local plugin packages">
  <h2>Local packages</h2>
  <p class="text-sm text-muted-foreground">Choose an Agent Plugins package folder. Inspection does not run code, start servers or load instructions into a conversation.</p>
  <Field.Field><Field.Label for="plugin-package-folder">Package folder</Field.Label><Input id="plugin-package-folder" placeholder="/path/to/plugin" bind:value={vm.root} /></Field.Field>
  <div class="flex gap-2"><StatefulButton variant="outline" pending={vm.pending === 'inspect'} disabled={Boolean(vm.pending) || !vm.root.trim()} onclick={() => vm.inspect()}>Inspect package</StatefulButton><StatefulButton variant="ghost" pending={vm.pending === 'refresh'} disabled={Boolean(vm.pending)} onclick={() => vm.refresh()}>Refresh</StatefulButton></div>
  {#if vm.error}<Alert.Root variant="destructive"><Alert.Description>{vm.error}</Alert.Description></Alert.Root>{/if}
  {#if vm.inspection}
    <section class="flex flex-col gap-2 border-t pt-3">
      <h3>{vm.inspection.name} {vm.inspection.version ?? ''}</h3>
      <p class="text-sm">{vm.inspection.skills.length} skills · {vm.inspection.servers.length} servers · {vm.inspection.backend ? 'Optional trusted backend' : 'Standard package'}</p>
      {#each vm.inspection.servers as server}<p class="text-sm">{server.name} · {server.transport}</p>{/each}
      {#each vm.inspection.diagnostics as message}<p class="text-sm text-muted-foreground">{message}</p>{/each}
      <StatefulButton class="w-fit" pending={vm.pending === 'add'} disabled={Boolean(vm.pending)} onclick={() => vm.add()}>Add without activating</StatefulButton>
    </section>
  {/if}
  {#each vm.installations as installation (installation.id)}
    <section class="flex flex-col gap-2 border-t py-3">
      <div class="flex items-center justify-between"><h3>{installation.name}</h3><Badge variant="outline">{installation.status}</Badge></div>
      <p class="break-all text-sm text-muted-foreground">{installation.root}</p>
      <form onsubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const servers = data.getAll('server').map(String); void vm.configure(installation.id, data.get('enabled') === 'on', data.get('backend') === 'on', servers, String(data.get('approvedResourceOrigins') ?? '').split(/\r?\n/).map(origin => origin.trim()).filter(Boolean), data.getAll('parallel-server').map(String).filter(name => servers.includes(name))); }} class="flex flex-col gap-3">
        <Field.Field orientation="horizontal"><Checkbox id={'enable-' + installation.id} name="enabled" checked={installation.enabled} /><Field.Label for={'enable-' + installation.id}>Activate configured servers and skills on next restart</Field.Label></Field.Field>
        <Field.Field orientation="horizontal"><Checkbox id={'trust-' + installation.id} name="backend" checked={installation.trustedBackend} /><Field.Label for={'trust-' + installation.id}>Trust this package’s backend to execute in the host process</Field.Label></Field.Field>
        {#each vm.serverChoices(installation.id) as server}
          <Field.Field orientation="horizontal"><Checkbox id={'server-' + installation.id + '-' + server.name} name="server" value={server.name} checked={installation.servers.includes(server.name)} disabled={server.transport === 'sse'} /><Field.Label for={'server-' + installation.id + '-' + server.name}>Server: {server.name}{server.transport === 'sse' ? ' (legacy SSE unsupported)' : ''}</Field.Label></Field.Field>
          <Field.Field orientation="horizontal"><Checkbox id={'parallel-' + installation.id + '-' + server.name} name="parallel-server" value={server.name} checked={installation.elicitationDisabledServers.includes(server.name)} disabled={server.transport === 'sse'} /><Field.Label for={'parallel-' + installation.id + '-' + server.name}>Allow parallel calls to {server.name}; disable its interactive forms</Field.Label></Field.Field>
        {/each}
        <p class="text-sm text-muted-foreground">Use parallel calls only when this server does not need to ask questions or show consent forms. Unexpected forms are rejected, not approved. Tool grants and AI approvals still apply. Changes take effect after restarting Drawloom.</p>
        <Field.Field><Field.Label for={'media-origins-' + installation.id}>Shared media declaration seeds</Field.Label><Textarea id={'media-origins-' + installation.id} name="approvedResourceOrigins" value={installation.approvedResourceOrigins.join('\n')} placeholder="https://media.example.com" /><Field.Description>Compatibility seed for this package. After activation, each exact HTTPS origin joins the shared host media policy for all workbenches; localhost HTTP is also supported. This allows declared media, styles and fonts, not remote scripts or general network access. Restart Drawloom to activate changed package settings.</Field.Description></Field.Field>
        <StatefulButton class="w-fit" variant="outline" type="submit" pending={vm.pending === installation.id} disabled={Boolean(vm.pending)}>Save activation settings</StatefulButton>
      </form>
      {#if installation.pendingRestart}<p class="text-sm" role="status">Saved. Restart Drawloom to apply these changes.</p>{/if}
      {#each installation.connections as connection}
        {@const auth = vm.authentication[installation.id + ':' + connection.name]}
        <div class="flex flex-col gap-2">
          <p class="text-sm">{connection.name} · {connection.status}{auth ? ` · ${auth.state}` : ''}</p>
          {#if connection.transport === 'streamable-http'}
          <Collapsible.Root>
            <Collapsible.Trigger class="text-sm">Preconfigured OAuth client</Collapsible.Trigger>
            <Collapsible.Content>
            <form class="flex flex-col gap-2 py-2" onsubmit={event => {
              event.preventDefault();
              const form = event.currentTarget;
              const path = String(new FormData(form).get('registrationFile') ?? '');
              form.reset();
              void vm.authenticate(installation.id, connection.name, 'configure-client', path);
            }}>
              <Field.Field><Field.Label for={'oauth-file-' + installation.id + connection.name}>Local registration JSON file</Field.Label><Input id={'oauth-file-' + installation.id + connection.name} name="registrationFile" placeholder="/path/to/client-registration.json" required /></Field.Field>
              <p class="text-sm text-muted-foreground">For servers requiring a registered client. The host reads this file into its credential store; its contents are not returned here. Your original file is not deleted.</p>
              <StatefulButton class="w-fit" variant="outline" type="submit" pending={vm.pending === 'oauth:' + installation.id + ':' + connection.name + ':configure-client'} disabled={Boolean(vm.pending)}>Import client registration</StatefulButton>
            </form>
            </Collapsible.Content>
          </Collapsible.Root>
          <div class="flex flex-wrap gap-2">
            {#each connectionActions as action}
              <StatefulButton variant="ghost" size="sm" pending={vm.pending === 'oauth:' + installation.id + ':' + connection.name + ':' + action} disabled={Boolean(vm.pending) && action !== 'cancel'} onclick={() => vm.authenticate(installation.id, connection.name, action)}>{action === 'status' ? 'Check sign-in' : action[0]!.toUpperCase() + action.slice(1)}</StatefulButton>
            {/each}
          </div>
          {#if auth?.authorizationUrl}<a class="text-sm underline" href={auth.authorizationUrl} target="_blank" rel="noopener noreferrer">Continue sign-in in your browser</a>{/if}
          {#if auth?.credentialMode === 'session'}<p class="text-sm text-muted-foreground">Session-only sign-in: the OS credential store is unavailable. Credentials will not be written to disk.</p>{/if}
          {#if auth?.restartRequired}<p class="text-sm">Restart Drawloom to load this server’s newly discovered contributions.</p>{/if}
          {#if auth?.code}<p class="text-sm text-muted-foreground">{auth.code}</p>{/if}
          {/if}
        </div>
      {/each}
      {#each installation.diagnostics as diagnostic}<p class="text-sm text-muted-foreground">{diagnostic}</p>{/each}
    </section>
  {/each}
  <p class="text-sm text-muted-foreground">Trusted code is not sandboxed. Activation does not grant tools permission to run. Use tool grants separately.</p>
  <Separator />
</section>
