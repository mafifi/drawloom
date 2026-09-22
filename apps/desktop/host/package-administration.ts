import { cleanup } from "./cleanup.js";
import {
  PackageActionSchema,
  PackageInspectionSchema,
  PackageOAuthActionSchema,
} from "../src/lib/package-protocol.js";
import { readClientRegistration } from "./plugin-registration.js";
import type { createInstallationStore } from "./plugin-installations.js";
import type { createPluginOAuthManager } from "./plugin-oauth.js";
import type { createPluginSettingsHost } from "./plugin-settings.js";
import type { loadInstalledPackages } from "./plugin-packages.js";
import type { createDesktopSessions } from "./desktop-sessions.js";
import type { createOrchestrationComposition } from "./orchestration-composition.js";

type Packages = Awaited<ReturnType<typeof loadInstalledPackages>>;
type Runtime = {
  packages: Pick<
    Packages,
    "activeServer" | "statuses" | "transportFor" | "reconnect" | "disconnect"
  >;
};

export function createPackageAdministration(deps: {
  selectedRuntime(): Promise<Runtime>;
  retireRuntimes(retire: (runtime: Runtime) => Promise<void>): Promise<void>;
  installations: Awaited<ReturnType<typeof createInstallationStore>>;
  oauth: ReturnType<typeof createPluginOAuthManager>;
  pluginSettings: Pick<ReturnType<typeof createPluginSettingsHost>, "invalidate">;
  orchestration: Pick<
    ReturnType<typeof createOrchestrationComposition>["host"],
    "changeInstallation"
  >;
  live: ReturnType<typeof createDesktopSessions>;
}) {
  const { selectedRuntime, installations, oauth, pluginSettings, orchestration, live } = deps;
  const projectRuntimes = { retire: deps.retireRuntimes };
  async function oauthConnection(id: string, serverName: string) {
    const { packages } = await selectedRuntime();
    const server = packages.activeServer(id, serverName);
    if (!server) throw Error("Activate this installation and restart before connecting");
    if (server.config.type !== "streamable-http")
      throw Error("This server does not use Drawloom HTTP authentication");
    return oauth.connection({
      installationId: id,
      serverName,
      serverUrl: server.config.url,
    });
  }

  async function disconnectPackageRuntimes(installationId: string, serverName: string) {
    await cleanup([
      () => pluginSettings.invalidate(installationId),
      () =>
        projectRuntimes.retire((runtime) =>
          runtime.packages.disconnect(installationId, serverName),
        ),
    ]);
  }

  async function installedPackages() {
    const { packages } = await selectedRuntime();
    return Promise.all(
      installations.list().map(async ({ configuration: _configuration, ...installation }) => {
        const current = packages.statuses.find((s) => s.id === installation.id);
        let availableServers = installation.servers.map((name) => ({
          name,
          transport: "unknown",
        }));
        try {
          availableServers = (await installations.inspect(installation.root)).servers.map(
            (server) => ({
              name: server.name,
              transport: server.config.type,
            }),
          );
        } catch {
          /* Retain selected identities and existing readiness errors if metadata is inaccessible. */
        }
        return {
          ...installation,
          pendingRestart: installations.pendingRestart(installation.id),
          status: current?.status ?? "not-active",
          availableServers,
          diagnostics: current?.codes ?? [],
          connections: (current?.servers ?? []).map((s) => ({
            ...s,
            transport: packages.transportFor(installation.id, s.name) ?? "unknown",
          })),
        };
      }),
    );
  }

  return {
    oauthCallback: (url: URL) => oauth.callback(url),
    async packageOAuth(raw: unknown) {
      const { packages } = await selectedRuntime();
      const input = PackageOAuthActionSchema.parse(raw);
      const connection = await oauthConnection(input.id, input.server);
      if (input.action === "configure-client") {
        if ([...live.values()].some((session) => session.active))
          throw Error("Wait for current work to finish before configuring authentication");
        const registration = await readClientRegistration(input.registrationFile);
        const disconnected = await connection.disconnect();
        await disconnectPackageRuntimes(input.id, input.server);
        if (disconnected.state === "failed")
          throw Error("Disconnect existing credentials before replacing registration");
        return connection.configureClient(registration);
      }
      if (input.action === "status") return connection.status();
      if (input.action === "connect") return connection.login();
      if (input.action === "cancel") return connection.cancel();
      if (input.action === "disconnect") {
        // Drop the authenticated MCP session as well as credentials.
        try {
          return await connection.disconnect();
        } finally {
          await disconnectPackageRuntimes(input.id, input.server);
        }
      }
      if ([...live.values()].some((session) => session.active))
        throw Error("Wait for current work to finish before reconnecting");
      return {
        ...connection.status(),
        ...(await packages.reconnect(input.id, input.server)),
      };
    },
    packageStatuses: async () => (await selectedRuntime()).packages.statuses,
    installedPackages,
    async packageAction(raw: unknown) {
      const action = PackageActionSchema.parse(raw);
      if (action.action === "inspect") {
        const inventory = await installations.inspect(action.root);
        return PackageInspectionSchema.parse({
          root: inventory.root,
          name: inventory.name,
          version: inventory.version,
          backend: Boolean(inventory.drawloom?.backend),
          skills: inventory.skills.map((s) => s.name),
          servers: inventory.servers.map((s) => ({
            name: s.name,
            transport: s.config.type,
          })),
          diagnostics: inventory.diagnostics.map((d) => `${d.component}: ${d.code}`),
        });
      }
      if (action.action === "add") await installations.add(action.root);
      else {
        const current = installations.list().find((i) => i.id === action.id);
        if (!current) throw Error("Installation unavailable");
        await orchestration.changeInstallation(
          action.id,
          () =>
            installations.configure(action.id, {
              ...action.settings,
              configuration: action.settings.configuration ?? current.configuration,
            }),
          () => installations.pendingRestart(action.id),
        );
        await pluginSettings.invalidate(action.id);
      }
      return installedPackages();
    },
  };
}
