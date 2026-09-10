import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { getToolUiResourceUri, isToolVisibilityAppOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { activatePackage, inspectPackage, readSkill, type ActivePackage, type ActivePackageServer, type ActivatePackageOptions } from '@drawloom/local-plugin-packages';
import { observed, observeOutcome } from './telemetry.js';
import type { DesktopCompositionContext } from '@drawloom/desktop-host';
import type { OperatorController } from '@drawloom/workbench';
import type { PluginInstaller, PluginRequirement, PackageInventory, RegisteredWorkbenchView } from '@drawloom/plugins';
import type { ToolDefinition, ToolGateway, ToolElicitationHandler } from '@drawloom/tools';
import { createPluginRegistry } from '@drawloom/startup-plugins';
import { OperatorSnapshotSchema } from '@drawloom/workbench';
import type { Installation } from './plugin-installations.js';
import { createBackendLoader } from './plugin-backend.js';
import { packageToolName, projectPackageServer } from './plugin-projection.js';
import { connectMcpAppClient, type ConnectedMcpApp } from './mcp-app.js';
import { createPackageResources } from './package-resources.js';

export type InstalledPackageStatus = { id: string; name: string; status: 'disabled' | 'ready' | 'partial' | 'failed'; codes: string[]; servers: ActivePackage['statuses'] };
export async function loadInstalledPackages(options: {
  root: string; installations: readonly Installation[]; host: DesktopCompositionContext;
  /** Composition-owned built-ins participate in collision checks, never package installation. */
  builtins?: readonly PluginInstaller[];
  authProviderFor?: (installation: Installation) => ActivatePackageOptions['authProviderFor'];
  elicitation?: ToolElicitationHandler;
  toolsFor?: (installation: Installation, tools: readonly ToolDefinition[], workbenchIds: readonly string[]) => ToolGateway;
}) {
  const installs: PluginInstaller[] = [];
  const toolIds = new Set<string>();
  const toolSources = new Map<string, string>();
  const toolPresentation = new Map<string, { name: string; description: string; origin: string; ownerId: string; appOnly: boolean; available: boolean }>();
  const resourceClients = new Map<string, Client>();
  const resources = createPackageResources(resourceClients);
  const standardTools: ToolDefinition[] = [];
  const toolAliases = new Map<string, string>();
  const skillAliases = new Map<string, string>();
  const slots = new Map<string, { client: Client; connection: ActivePackageServer; declaration: string; source: string }>();
  const controllers = new Map<string, OperatorController>();
  const mcpApps = new Map<string, ConnectedMcpApp>();
  const viewConnections = new Set<string>();
  const statuses: InstalledPackageStatus[] = [];
  const active: ActivePackage[] = [];
  const backendClients: Client[] = [];
  const backends = createBackendLoader();
  const prepared: { installation: Installation; inventory: PackageInventory; connections: ActivePackage; status: InstalledPackageStatus }[] = [];
  const available: PluginRequirement[] = [{ kind: 'capability', id: 'host' }];
  const dependencies: { packageName: string; requirement: PluginRequirement; alias?: string }[] = [];
  for (const installation of options.installations) {
    const status: InstalledPackageStatus = { id: installation.id, name: installation.name, status: installation.enabled ? 'ready' : 'disabled', codes: [], servers: [] };
    statuses.push(status);
    if (!installation.enabled) continue;
    try {
      const inventory = await observed('host.package.inspect', { 'drawloom.plugin.id': installation.id }, () => inspectPackage(installation.root));
      const authProviderFor = options.authProviderFor?.(installation);
      const connections = await observed('host.package.connect', { 'drawloom.plugin.id': installation.id }, async () => {
        const connections = await activatePackage(inventory, { dataRoot: join(options.root, 'plugins'), installationId: installation.id,
        selectedServers: installation.servers, clientCapabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
        ...(options.elicitation ? { elicitation: options.elicitation } : {}),
        ...(authProviderFor ? { authProviderFor } : {}) });
        if (connections.statuses.some(s => s.status !== 'connected')) observeOutcome('error');
        return connections;
      });
      active.push(connections); status.servers = connections.statuses;
      status.codes.push(...inventory.diagnostics.map(d => `${d.component}:${d.code}`));
      const tools: ToolDefinition[] = [];
      for (const [serverName, connection] of connections.servers) {
        try {
          const key = JSON.stringify([installation.id, serverName]);
          const projection = await projectPackageServer(installation.id, serverName, connection.client, () => {
            const slot = slots.get(key); if (!slot) throw Error('Package connection unavailable'); return slot.client;
          }, (params, context) => {
            const slot = slots.get(key); if (!slot) throw Error('Package connection unavailable'); return slot.connection.callTool(params, context);
          });
          tools.push(...projection.tools); status.codes.push(...projection.diagnostics);
          for (const tool of projection.inventory) {
            const alias = packageToolName(installation.id, serverName, tool.name);
            toolPresentation.set(alias, { name: tool.title ?? tool.name, description: tool.description ?? '',
              origin: `${inventory.name} / ${serverName}`, ownerId: `drawloom:plugin:package:${installation.id}`,
              appOnly: isToolVisibilityAppOnly(tool), available: projection.tools.some(t => t.name === alias) });
          }
          projection.tools.forEach(tool => toolIds.add(tool.name));
          const source = `package:${installation.id}:${createHash('sha256').update(JSON.stringify(inventory.servers.find(s => s.name === serverName))).digest('hex')}`;
          slots.set(key, { client: connection.client, connection, declaration: JSON.stringify(projection.inventory), source });
          if (connection.client.getServerCapabilities()?.resources) resourceClients.set(source, connection.client);
          projection.tools.forEach(tool => toolSources.set(tool.name, source));
          for (const tool of projection.inventory) {
            const alias = packageToolName(installation.id, serverName, tool.name);
            if (!projection.tools.some(projected => projected.name === alias)) continue;
            const id = `package:${inventory.name}:${serverName}:${tool.name}`;
            dependencies.push({ packageName: inventory.name, requirement: { kind: 'tool', id }, alias });
          }
        } catch { status.codes.push(`tools:${serverName}:discovery-failed`); }
      }
      const skills = [];
      for (const skill of inventory.skills) {
        try {
          skills.push({ id: `package:${installation.id}:skill:${skill.name}`, title: skill.name, description: skill.description,
            instructions: `${await readSkill(inventory, skill.name)}\n\nSkill source: ${join(inventory.root, skill.path)}. Resolve supporting files relative to this skill's directory; normal file permissions still apply.` });
          dependencies.push({ packageName: inventory.name, requirement: { kind: 'skill', id: `package:${inventory.name}:skill:${skill.name}` }, alias: `package:${installation.id}:skill:${skill.name}` });
        } catch { status.codes.push(`skill:${skill.name}:unavailable`); }
      }
      const contribution = { tools, skills };
      standardTools.push(...tools);
      installs.push({ config: {}, plugin: { id: `package:${installation.id}`, version: inventory.version ?? 'unversioned', requires: [], prepare: () => () => contribution } });
      prepared.push({ installation, inventory, connections, status });
    } catch { status.status = 'failed'; status.codes.push('package-unavailable'); }
  }
  // Resolve identities only after inspection: saved display names may be stale,
  // and two installations must never make the same dependency ambiguous.
  for (const dependency of dependencies) {
    if (prepared.filter(p => p.inventory.name === dependency.packageName).length !== 1 ||
      dependencies.filter(d => d.requirement.kind === dependency.requirement.kind && d.requirement.id === dependency.requirement.id).length !== 1) continue;
    available.push(dependency.requirement);
    if (dependency.alias) (dependency.requirement.kind === 'tool' ? toolAliases : skillAliases).set(dependency.requirement.id, dependency.alias);
  }
  // All standard contributions are inspected before any trusted backend executes.
  for (const { installation, inventory, connections, status } of prepared) {
    let ownedViews: readonly RegisteredWorkbenchView[] = [];
    const gateway = options.toolsFor?.(installation, standardTools, inventory.drawloom?.workbenches?.map(w => w.id) ?? []);
    const aliases = new Map<string, string>();
    const identities = new Map([...toolAliases].map(([id, alias]) => [alias, id]));
    const tools: ToolGateway | undefined = gateway && {
      exposure: { ...gateway.exposure, tools: gateway.exposure.tools.map(tool => {
        const name = identities.get(tool.name) ?? tool.name;
        aliases.set(name, tool.name); return { ...tool, name };
      }) },
      bind: operationId => gateway.bind(operationId), revoke: binding => gateway.revoke(binding),
      invoke: async (binding, name, args, signal) => {
        const alias = aliases.get(name); if (!alias) throw Error('Tool unavailable to this backend');
        return gateway.invoke(binding, alias, args, signal);
      },
    };
    const present = new Set(available.map(r => `${r.kind}:${r.id}`));
    if (tools) present.add('capability:tools');
    const requirementsResolved = (inventory.drawloom?.requires ?? []).every(r => present.has(`${r.kind}:${r.id}`) &&
      (r.kind !== 'tool' || !tools || aliases.has(r.id)));
    if (!requirementsResolved) {
      status.codes.push('extension:unavailable'); status.status = 'partial'; continue;
    }
    const result = await observed('host.package.activate', { 'drawloom.plugin.id': installation.id }, async () => {
      const result = await backends.activate(inventory, {
      trusted: installation.trustedBackend, available,
      installationId: installation.id, dataDirectory: join(options.root, 'plugins', installation.id), configuration: installation.configuration,
      capabilities: { host: { ...options.host, store: {
        get: key => options.host.store.get(JSON.stringify(['plugin', installation.id, key])),
        set: (key, value) => options.host.store.set(JSON.stringify(['plugin', installation.id, key]), value),
      } }, ...(tools ? { tools } : {}) },
      });
      if (result.status === 'untrusted') observeOutcome('denied');
      else if (result.status === 'failed' || result.status === 'unavailable') observeOutcome('error');
      return result;
    });
    if (result.status === 'ready') {
      const backend = result.backend;
      if (backend.contributions || backend.controllers) {
        try {
          const raw = backend.contributions ?? {};
          const contribution = { ...raw, ...(raw.workbenches ? { workbenches: raw.workbenches.map(workbench => ({ ...workbench,
            tools: workbench.tools.map(id => toolAliases.get(id) ?? id), skills: workbench.skills.map(id => skillAliases.get(id) ?? id),
          })) } : {}) };
        const preparedInstalls = [{ config: {}, plugin: { id: `package:${installation.id}:backend`,
          version: inventory.version ?? 'unversioned', requires: [], prepare: () => () => contribution } }];
        const validated = createPluginRegistry([...(options.builtins ?? []), ...installs, ...preparedInstalls], ['agent', 'host']);
        for (const [id, controller] of backend.controllers ?? []) {
          if (!contribution.workbenches?.some(w => w.id === id) || typeof controller.dispatch !== 'function') throw Error('Invalid controller');
          OperatorSnapshotSchema.parse(await controller.snapshot());
        }
        const duplicate = [...(backend.controllers?.keys() ?? [])].some(id => controllers.has(id));
        if (duplicate) status.codes.push('backend:duplicate-contribution');
        else {
          installs.push(...preparedInstalls);
          const ownedPlugins = new Set(preparedInstalls.map(i => i.plugin.id));
          ownedViews = validated.views.filter(view => ownedPlugins.has(view.pluginId) &&
            validated.contributions.some(c => c.pluginId === view.pluginId && c.kind === 'workbench' && c.contributionId === view.workbenchId));
          for (const [id, controller] of backend.controllers ?? []) controllers.set(id, controller);
        }
        } catch { status.codes.push('backend:invalid-contribution'); }
      }
      for (const server of result.backend.servers ?? []) {
        const client = new Client({ name: 'drawloom-package-backend', version: '0.0.0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } } });
        try {
          await client.connect(server.transport, { timeout: 15_000 }); backendClients.push(client);
          connections.servers.set(server.name, { client, callTool: async (params, context) => CallToolResultSchema.parse(await client.callTool(params, undefined, { signal: context.signal })), close: () => Promise.resolve() });
        } catch { await client.close(); status.codes.push(`backend-server:${server.name}:failed`); }
      }
    } else if (result.status !== 'absent') status.codes.push(`backend:${result.status}`);
    for (const placement of inventory.drawloom?.workbenches ?? []) {
      const view = ownedViews.find(view => view.workbenchId === placement.id);
      if (!view || mcpApps.has(placement.id) ||
        inventory.drawloom!.workbenches!.filter(p => p.id === placement.id).length !== 1) {
        status.codes.push(`workbench:${placement.id}:view-unavailable`); continue;
      }
      const connection = connections.servers.get(placement.openingTool.server);
      if (!connection) { status.codes.push(`workbench:${placement.id}:server-unavailable`); continue; }
      try {
        const projection = await projectPackageServer(installation.id, placement.openingTool.server, connection.client);
        const opening = projection.inventory.find(t => t.name === placement.openingTool.tool);
        const uri = opening && getToolUiResourceUri(opening);
        if (!uri || uri !== view.entrypoint) throw Error('Opening resource unavailable');
        const app = await connectMcpAppClient(connection.client, placement.openingTool.tool, uri);
        mcpApps.set(placement.id, app);
        viewConnections.add(JSON.stringify([installation.id, placement.openingTool.server]));
      } catch { status.codes.push(`workbench:${placement.id}:view-unavailable`); }
    }
    if (status.codes.length || status.servers.some(s => s.status !== 'connected')) status.status = 'partial';
  }
  return { installs, controllers, mcpApps, statuses, toolIds, toolSources, toolPresentation,
    discoverResources: resources.discover, readDiscoveredResource: resources.read,
    activeServer(installationId: string, name: string) {
      const pkg = prepared.find(p => p.installation.id === installationId);
      const server = pkg?.installation.servers.includes(name) ? pkg.inventory.servers.find(s => s.name === name) : undefined;
      return server ? structuredClone(server) : undefined;
    },
    transportFor: (installationId: string, name: string) => prepared.find(p => p.installation.id === installationId)?.inventory.servers.find(s => s.name === name)?.config.type,
    async disconnect(installationId: string, serverName: string) {
      const preparedPackage = prepared.find(p => p.installation.id === installationId);
      const connection = preparedPackage?.connections.servers.get(serverName);
      if (connection) await connection.close();
      const slot = slots.get(JSON.stringify([installationId, serverName]));
      if (slot) resourceClients.delete(slot.source);
      const state = preparedPackage?.status.servers.find(s => s.name === serverName);
      if (state) { state.status = 'auth-required'; state.code = 'disconnected'; }
    },
    async reconnect(installationId: string, serverName: string) {
      const pkg = prepared.find(p => p.installation.id === installationId);
      if (!pkg || !pkg.installation.servers.includes(serverName)) throw Error('Installation server unavailable');
      if (viewConnections.has(JSON.stringify([installationId, serverName]))) return { restartRequired: true };
      // A newly authenticated server may be discovered here. New definitions are
      // applied only on restart; reconnection never changes an active registry.
      const authProviderFor = options.authProviderFor?.(pkg.installation);
      const opened = await activatePackage(pkg.inventory, { dataRoot: join(options.root, 'plugins'), installationId,
        selectedServers: [serverName], clientCapabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
        ...(options.elicitation ? { elicitation: options.elicitation } : {}),
        ...(authProviderFor ? { authProviderFor } : {}) });
      const connection = opened.servers.get(serverName);
      if (!connection) { await opened.close(); throw Error('Connection unavailable'); }
      const slot = slots.get(JSON.stringify([installationId, serverName]));
      const projection = await projectPackageServer(installationId, serverName, connection.client);
      if (!slot || slot.declaration !== JSON.stringify(projection.inventory)) { await opened.close(); return { restartRequired: true }; }
      await pkg.connections.servers.get(serverName)?.close();
      slot.client = connection.client;
      slot.connection = connection;
      pkg.connections.servers.set(serverName, connection);
      if (connection.client.getServerCapabilities()?.resources) resourceClients.set(slot.source, connection.client);
      active.push(opened);
      const stateIndex = pkg.status.servers.findIndex(s => s.name === serverName);
      const replacementState = opened.statuses.find(s => s.name === serverName);
      // Keep the live object updated by the replacement runtime's onclose.
      if (stateIndex !== -1 && replacementState) pkg.status.servers[stateIndex] = replacementState;
      return { restartRequired: false };
    },
    canReadSource: (source: string) => resourceClients.has(source),
    async readResource(source: string, uri: string) {
      // Caller must supply a source-bound receipt from discovery or stored history.
      const client = resourceClients.get(source); if (!client) throw Error('Package resource unavailable');
      return client.readResource({ uri }, { timeout: 15_000 });
    },
    async close() {
      return observed('host.package.close', {}, async () => {
      await Promise.allSettled([...mcpApps.values()].map(async app => app.close()));
      await Promise.allSettled(backendClients.map(async client => client.close()));
      try { await backends.close(); }
      finally { await Promise.allSettled(active.map(async pkg => pkg.close())); }
      });
    },
  };
}
