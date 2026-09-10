import { auth, discoverOAuthProtectedResourceMetadata, discoverAuthorizationServerMetadata, refreshAuthorization, UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { OAuthClientInformationSchema, OAuthClientInformationFullSchema, OAuthTokensSchema, type OAuthClientInformationMixed, type OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { PluginCredentialStore } from './plugin-credentials.ts';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PackageRemoteConfigSchema } from '@drawloom/plugins';

export type PluginOAuthState = 'disconnected' | 'auth-required' | 'awaiting-approval' | 'authorized' | 'denied' | 'cancelled' | 'refresh-failed' | 'failed';
export interface PluginOAuthStatus { state: PluginOAuthState; credentialMode: 'os' | 'session'; issuer?: string; code?: string }
export interface PluginOAuthConnectionOptions {
  installationId: string; serverName: string; serverUrl: string;
  preconfiguredClient?: { issuer: string; information: OAuthClientInformationMixed };
}
export interface PluginOAuthManagerOptions {
  credentials: PluginCredentialStore;
  redirectUrl: string | (() => string);
  fetch?: FetchLike;
  clientMetadataUrl?: string;
}
export interface PluginOAuthConnection {
  provider: OAuthClientProvider;
  status(): PluginOAuthStatus;
  login(): Promise<PluginOAuthStatus & { authorizationUrl?: string }>;
  callback(url: URL): Promise<PluginOAuthStatus>;
  cancel(): PluginOAuthStatus;
  disconnect(): Promise<PluginOAuthStatus>;
  refresh(): Promise<PluginOAuthStatus>;
  configureClient(value: unknown): Promise<PluginOAuthStatus>;
}
export interface PluginOAuthManager {
  connection(options: PluginOAuthConnectionOptions): PluginOAuthConnection;
  callback(url: URL): Promise<PluginOAuthStatus>;
}
export const DRAWLOOM_OAUTH_CLIENT_METADATA_URL = 'https://mafifi.github.io/drawloom/oauth/client.json';
// Preserve registered client metadata, especially the selected token authentication
// method. The minimal branch must not silently strip malformed/partial metadata.
const ClientInformation = z.union([OAuthClientInformationFullSchema, OAuthClientInformationSchema.strict()]);
export const PreconfiguredClientSchema = z.strictObject({ issuer: z.string().url(), information: ClientInformation });
const StoredCredentials = z.object({ version: z.literal(1), issuer: z.string(), resource: z.string(), client: ClientInformation,
  tokens: OAuthTokensSchema, expiresAt: z.number().optional() });
type Stored = z.infer<typeof StoredCredentials>;
type Pending = { state: string; epoch: number; expiresAt: number; redirect: string; issuer: string; verifier?: string; authorizationUrl?: string };
function secureUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Unsafe OAuth endpoint');
  return url;
}
function redirectUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/oauth/callback' || url.search || url.hash || url.username || url.password)
    throw Error('OAuth callback must be the bound loopback listener');
  return url.href;
}
export function createPluginOAuthManager(options: PluginOAuthManagerOptions): PluginOAuthManager {
  const connections = new Map<string, PluginOAuthConnection>();
  const callbacks = new Map<string, PluginOAuthConnection>();
  const clientMetadataUrl = options.clientMetadataUrl ?? DRAWLOOM_OAUTH_CLIENT_METADATA_URL;
  secureUrl(clientMetadataUrl);
  const manager: PluginOAuthManager = {
    connection(input) {
      if (!input.installationId || !input.serverName) throw Error('Missing OAuth connection identity');
      const resource = new URL(PackageRemoteConfigSchema.parse({ type: 'streamable-http', url: input.serverUrl }).url).href;
      const identity = JSON.stringify([input.installationId, input.serverName, resource]);
      const existing = connections.get(identity);
      if (existing) return existing;
      const registrationKey = 'client:' + createHash('sha256').update(identity).digest('hex');
      let preconfigured = input.preconfiguredClient;
      let state: PluginOAuthState = 'disconnected', code: string | undefined;
      let discovery: OAuthDiscoveryState | undefined, stored: Stored | undefined, credentialKey: string | undefined;
      let issuerParameterRequired = false;
      let pending: Pending | undefined, epoch = 0, paused = false;
      let loading: Promise<void> | undefined, refreshing: Promise<PluginOAuthStatus> | undefined;
      let writes: Promise<void> = Promise.resolve();
      const status = (): PluginOAuthStatus => ({ state, credentialMode: options.credentials.mode,
        ...(discovery ? { issuer: discovery.authorizationServerUrl } : {}), ...(code ? { code } : {}) });
      const setState = (next: PluginOAuthState, reason?: string) => { state = next; code = reason; return status(); };
      const assertCurrent = (version: number) => { if (version !== epoch) throw Error('OAuth operation cancelled'); };
      const cancelPending = () => { if (pending) callbacks.delete(pending.state); pending = undefined; epoch++; };
      const metadata = () => ({ redirect_uris: [pending?.redirect ?? redirectUri(typeof options.redirectUrl === 'function' ? options.redirectUrl() : options.redirectUrl)],
        client_name: 'Drawloom', client_uri: 'https://mafifi.github.io/drawloom/', token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
      const network: FetchLike = async (inputUrl, init) => {
        const url = new URL(inputUrl);
        const method = (init?.method ?? 'GET').toUpperCase();
        if (!(method === 'GET' && url.origin === new URL(resource).origin && url.protocol === 'http:')) secureUrl(url.href);
        if (url.username || url.password || url.hash) throw Error('Unsafe OAuth endpoint');
        const asMetadata = discovery?.authorizationServerMetadata;
        const tokenRequest = url.href === asMetadata?.token_endpoint;
        const registrationRequest = url.href === asMetadata?.registration_endpoint;
        if (method !== 'GET' && !(method === 'POST' && (tokenRequest || registrationRequest))) throw Error('Unbound OAuth endpoint');
        if (method === 'GET' && (new Headers(init?.headers).has('authorization') || init?.body)) throw Error('Credentials forbidden in discovery');
        const signal = AbortSignal.any([AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]);
        const response = await (options.fetch ?? fetch)(url, { ...init, redirect: 'manual', credentials: 'omit', signal });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw Error('OAuth redirect rejected'); }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        if (reader) {
          try {
            for (;;) {
              const item = await reader.read(); if (item.done) break;
              size += item.value.byteLength;
              if (size > 1024 * 1024) throw Error('OAuth response exceeds limit');
              chunks.push(item.value);
            }
          } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        }
        const body = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        if (tokenRequest && response.ok) {
          const payload: unknown = JSON.parse(new TextDecoder().decode(body));
          if (payload && typeof payload === 'object') {
            if ('resource' in payload && payload.resource !== resource) throw Error('Token resource mismatch');
            if ('iss' in payload && payload.iss !== discovery?.authorizationServerUrl) throw Error('Token issuer mismatch');
          }
        }
        return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers });
      };
      async function ensureLoaded() {
        loading ??= (async () => {
          const registration = await options.credentials.get(registrationKey);
          if (registration) preconfigured = PreconfiguredClientSchema.parse(JSON.parse(registration));
          const resourceMetadata = await discoverOAuthProtectedResourceMetadata(resource, {}, network);
          if (resourceMetadata.resource !== resource || !resourceMetadata.authorization_servers?.length) throw Error('Resource metadata mismatch');
          const issuer = resourceMetadata.authorization_servers[0]!;
          secureUrl(issuer);
          const serverMetadata = await discoverAuthorizationServerMetadata(issuer, { fetchFn: network });
          if (!serverMetadata || serverMetadata.issuer !== issuer) throw Error('Issuer metadata mismatch');
          issuerParameterRequired = z.object({ authorization_response_iss_parameter_supported: z.boolean().optional() }).parse(serverMetadata).authorization_response_iss_parameter_supported === true || resourceMetadata.authorization_servers.length > 1;
          secureUrl(serverMetadata.authorization_endpoint); secureUrl(serverMetadata.token_endpoint);
          if (serverMetadata.registration_endpoint) secureUrl(serverMetadata.registration_endpoint);
          if (!serverMetadata.response_types_supported.includes('code') || !serverMetadata.code_challenge_methods_supported?.includes('S256')) throw Error('S256 authorization code required');
          discovery = { authorizationServerUrl: issuer, authorizationServerMetadata: serverMetadata, resourceMetadata };
          credentialKey = createHash('sha256').update(JSON.stringify([identity, issuer])).digest('hex');
          const saved = await options.credentials.get(credentialKey);
          if (saved) {
            const parsed = StoredCredentials.parse(JSON.parse(saved));
            if (parsed.issuer !== issuer || parsed.resource !== resource) throw Error('Stored credential binding mismatch');
            stored = parsed; if (!paused) setState('authorized');
          } else if (!paused) setState('auth-required');
        })();
        try { await loading; } catch (error) { loading = undefined; throw error; }
      }
      async function save(tokens: OAuthTokens, client: OAuthClientInformationMixed, version: number) {
        const validated = OAuthTokensSchema.parse(tokens);
        if (!validated.access_token || validated.token_type.toLowerCase() !== 'bearer' || (validated.expires_in !== undefined && (!Number.isFinite(validated.expires_in) || validated.expires_in < 0))) throw Error('Invalid OAuth tokens');
        const record: Stored = { version: 1, issuer: discovery!.authorizationServerUrl, resource,
          client: ClientInformation.parse(client), tokens: validated,
          ...(validated.expires_in === undefined ? {} : { expiresAt: Date.now() + validated.expires_in * 1000 }) };
        writes = writes.catch(() => {}).then(async () => {
          assertCurrent(version);
          await options.credentials.set(credentialKey!, JSON.stringify(record));
          if (version !== epoch) { await options.credentials.delete(credentialKey!); throw Error('OAuth operation cancelled'); }
          stored = record;
        });
        await writes;
      }
      function flowProvider(flow: Pending): OAuthClientProvider {
        let client = preconfigured ? ClientInformation.parse(preconfigured.information) : stored?.client;
        if (preconfigured?.issuer !== undefined && preconfigured.issuer !== flow.issuer) throw Error('Preconfigured client issuer mismatch');
        return {
          redirectUrl: flow.redirect, clientMetadataUrl,
          get clientMetadata() { return metadata(); },
          state() { assertCurrent(flow.epoch); return flow.state; },
          discoveryState() { assertCurrent(flow.epoch); return discovery; },
          clientInformation() { assertCurrent(flow.epoch); return client; },
          saveClientInformation(value) {
            assertCurrent(flow.epoch);
            if (!discovery?.authorizationServerMetadata?.client_id_metadata_document_supported && !discovery?.authorizationServerMetadata?.registration_endpoint && !preconfigured) throw Error('Client registration unavailable');
            client = ClientInformation.parse(value);
            if (!client.client_id) throw Error('Missing OAuth client identity');
          },
          tokens() { return undefined; },
          saveTokens(tokens) { assertCurrent(flow.epoch); if (!client) throw Error('Missing client identity'); return save(tokens, client, flow.epoch); },
          saveCodeVerifier(verifier) { assertCurrent(flow.epoch); flow.verifier = verifier; },
          codeVerifier() { assertCurrent(flow.epoch); if (!flow.verifier) throw Error('Missing PKCE verifier'); return flow.verifier; },
          redirectToAuthorization(url) {
            assertCurrent(flow.epoch);
            if (url.origin + url.pathname !== new URL(discovery!.authorizationServerMetadata!.authorization_endpoint).origin + new URL(discovery!.authorizationServerMetadata!.authorization_endpoint).pathname || url.searchParams.get('state') !== flow.state || url.searchParams.get('resource') !== resource || url.searchParams.get('code_challenge_method') !== 'S256') throw Error('Authorization binding mismatch');
            flow.authorizationUrl = url.href;
          },
          validateResourceURL(_url, discovered) { if (discovered !== resource) return Promise.reject(Error('Resource mismatch')); return Promise.resolve(new URL(resource)); },
          invalidateCredentials() { throw new UnauthorizedError('Explicit OAuth reconnect required'); },
        };
      }
      let interactiveProvider: OAuthClientProvider | undefined;
      const connection: PluginOAuthConnection = {
        status,
        async configureClient(value) {
          const registration = PreconfiguredClientSchema.parse(value);
          secureUrl(registration.issuer);
          const disconnected = await connection.disconnect();
          if (disconnected.state === 'failed') throw Error('Disconnect existing credentials before replacing registration');
          const version = epoch;
          writes = writes.catch(() => {}).then(async () => {
            assertCurrent(version);
            await options.credentials.set(registrationKey, JSON.stringify(registration));
            if (version !== epoch) { await options.credentials.delete(registrationKey); throw Error('OAuth operation cancelled'); }
            preconfigured = registration;
          });
          await writes;
          return setState('disconnected', 'client_registration_saved');
        },
        provider: {
          get redirectUrl() { return redirectUri(typeof options.redirectUrl === 'function' ? options.redirectUrl() : options.redirectUrl); },
          get clientMetadata() { return metadata(); },
          clientInformation() { return stored?.client; },
          async tokens() {
            if (paused) return undefined;
            const version = epoch;
            try {
              await ensureLoaded();
              if (paused || version !== epoch) return undefined;
              if (stored?.expiresAt !== undefined && stored.expiresAt <= Date.now() + 30_000) await connection.refresh();
              if (paused || version !== epoch) return undefined;
              return stored?.tokens;
            } catch { if (!paused && version === epoch) setState('failed', 'oauth_discovery_failed'); return undefined; }
          },
          saveTokens() { throw new UnauthorizedError('Use explicit OAuth login'); },
          redirectToAuthorization() { throw new UnauthorizedError('Use explicit OAuth login'); },
          saveCodeVerifier() { throw new UnauthorizedError('Use explicit OAuth login'); },
          codeVerifier() { throw new UnauthorizedError('Use explicit OAuth login'); },
          discoveryState() { if (!paused) setState('auth-required'); throw new UnauthorizedError('Use explicit OAuth login'); },
          invalidateCredentials() { throw new UnauthorizedError('Use explicit OAuth reconnect'); },
        },
        async login() {
          cancelPending(); paused = false; const version = epoch;
          try {
            await ensureLoaded(); assertCurrent(version);
            const flow: Pending = { state: randomBytes(32).toString('base64url'), epoch: version, expiresAt: Date.now() + 5 * 60_000,
              redirect: redirectUri(typeof options.redirectUrl === 'function' ? options.redirectUrl() : options.redirectUrl), issuer: discovery!.authorizationServerUrl };
            pending = flow; interactiveProvider = flowProvider(flow);
            const result = await auth(interactiveProvider, { serverUrl: resource, fetchFn: network });
            assertCurrent(version);
            if (result !== 'REDIRECT' || !flow.authorizationUrl) throw Error('Authorization redirect missing');
            callbacks.set(flow.state, connection); setState('awaiting-approval');
            return { ...status(), authorizationUrl: flow.authorizationUrl };
          } catch { if (version === epoch) { cancelPending(); setState('failed', 'oauth_login_failed'); } return status(); }
        },
        async callback(url) {
          const flow = pending, values = url.searchParams;
          if (!flow || values.getAll('state').length !== 1 || values.get('state') !== flow.state || callbacks.get(flow.state) !== connection) throw Error('Invalid OAuth callback state');
          callbacks.delete(flow.state); pending = undefined;
          if (flow.expiresAt < Date.now() || url.origin + url.pathname !== new URL(flow.redirect).origin + new URL(flow.redirect).pathname || url.hash || values.getAll('iss').length > 1 || values.getAll('code').length > 1 || values.getAll('error').length > 1 ||
            (values.has('iss') && values.get('iss') !== flow.issuer) ||
            (issuerParameterRequired && values.get('iss') !== flow.issuer)) {
            setState('failed', 'oauth_callback_invalid'); throw Error('Invalid OAuth callback binding');
          }
          if (values.has('error')) { paused = true; delete flow.verifier; return setState(values.get('error') === 'access_denied' ? 'denied' : 'failed', 'oauth_authorization_denied'); }
          if (!values.get('code') || !interactiveProvider) { setState('failed', 'oauth_callback_invalid'); throw Error('Missing authorization code'); }
          const callbackProvider = interactiveProvider;
          try {
            const result = await auth(callbackProvider, { serverUrl: resource, authorizationCode: values.get('code')!, fetchFn: network });
            assertCurrent(flow.epoch);
            if (result !== 'AUTHORIZED' || !stored) throw Error('Authorization incomplete');
            paused = false; return setState('authorized');
          } catch { if (flow.epoch === epoch) setState('failed', 'oauth_exchange_failed'); return status(); }
          finally { delete flow.verifier; if (interactiveProvider === callbackProvider) interactiveProvider = undefined; }
        },
        cancel() { cancelPending(); interactiveProvider = undefined; paused = true; return setState('cancelled'); },
        async disconnect() {
          cancelPending(); paused = true; interactiveProvider = undefined; stored = undefined;
          try {
            if (!credentialKey) await ensureLoaded();
            stored = undefined;
            writes = writes.catch(() => {}).then(async () => {
              if (credentialKey) await options.credentials.delete(credentialKey);
              await options.credentials.delete(registrationKey);
              preconfigured = undefined;
            });
            await writes; return setState('disconnected');
          } catch { return setState('failed', 'oauth_credential_delete_failed'); }
        },
        refresh() {
          refreshing ??= (async () => {
            const version = epoch;
            try {
              await ensureLoaded(); assertCurrent(version);
              if (paused || !stored?.tokens.refresh_token) throw Error('No refresh credential');
              const next = await refreshAuthorization(discovery!.authorizationServerUrl, {
                metadata: discovery!.authorizationServerMetadata!, clientInformation: stored.client,
                refreshToken: stored.tokens.refresh_token, resource: new URL(resource), fetchFn: network,
              });
              await save(next, stored.client, version); return setState('authorized');
            } catch {
              if (version === epoch) {
                paused = true; stored = undefined;
                if (credentialKey) { try { await options.credentials.delete(credentialKey); } catch { /* Status remains explicit failure. */ } }
                setState('refresh-failed', 'oauth_refresh_failed');
              }
              return status();
            }
          })().finally(() => { refreshing = undefined; });
          return refreshing;
        },
      };
      connections.set(identity, connection); return connection;
    },
    async callback(url) {
      const state = url.searchParams.get('state');
      const connection = state ? callbacks.get(state) : undefined;
      if (!connection) throw Error('Invalid OAuth callback state');
      return connection.callback(url);
    },
  };
  return manager;
}
