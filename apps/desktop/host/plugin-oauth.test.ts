import { test, expect, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { createPluginOAuthManager } from './plugin-oauth.js';
import { createSessionCredentialStore, type PluginCredentialStore } from './plugin-credentials.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';

const resource = 'https://resource.example/mcp', issuer = 'https://issuer.example';
const callback = 'http://127.0.0.1:38271/oauth/callback';
test('preconfigured client persists only in credential storage and is bound to its connection', async () => {
  const fixture = await service();
  const credentials = createSessionCredentialStore();
  const options = { credentials, redirectUrl: callback, fetch: fixture.fetch };
  const identity = { installationId: 'configured', serverName: 'remote', serverUrl: resource };
  try {
    const first = createPluginOAuthManager(options).connection(identity);
    await first.configureClient({ issuer, information: { client_id: 'private-client', client_secret: 'private-secret' } });
    const restarted = createPluginOAuthManager(options);
    const connection = restarted.connection(identity);
    const login = await connection.login();
    expect(new URL(login.authorizationUrl!).searchParams.get('client_id')).toBe('private-client');
    expect(JSON.stringify(connection.status())).not.toContain('private-secret');
    const other = await restarted.connection({ ...identity, installationId: 'other' }).login();
    expect(new URL(other.authorizationUrl!).searchParams.get('client_id')).not.toBe('private-client');
    await connection.disconnect();
    const disconnected = await createPluginOAuthManager(options).connection(identity).login();
    expect(new URL(disconnected.authorizationUrl!).searchParams.get('client_id')).not.toBe('private-client');
    const changed = createPluginOAuthManager(options).connection(identity);
    await changed.configureClient({ issuer: 'https://other-issuer.example', information: { client_id: 'wrong-client' } });
    expect((await changed.login()).state).toBe('failed');
  } finally { fixture.close(); }
});
async function service(resourceUrl = resource) {
  const resource = resourceUrl;
  const codes = new Map<string, { challenge: string; redirect: string; resource: string }>();
  const effects = { token: 0, refresh: 0, registration: 0, discovery: 0, authentication: [] as string[] };
  const config = { resource, issuer, advertisedIssuer: issuer, denied: false, refreshFailure: false, cimd: true, badEndpoint: false, wrongTokenResource: false, redirectToken: false, requireClientPost: false };
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      effects.discovery++; return Response.json({ resource: config.resource, authorization_servers: [config.advertisedIssuer] });
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') return Response.json({
      issuer: config.issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: config.badEndpoint ? 'http://insecure.example/token' : issuer + '/token',
      registration_endpoint: issuer + '/register', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      authorization_response_iss_parameter_supported: true, client_id_metadata_document_supported: config.cimd,
    });
    if (url.pathname === '/register') { effects.registration++; return Response.json({ ...(await request.json() as object), client_id: 'registered-client', ...(config.requireClientPost ? { client_secret: 'registered-secret', token_endpoint_auth_method: 'client_secret_post' } : {}) }); }
    if (url.pathname === '/authorize') {
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('resource')).toBe(resource);
      const redirect = new URL(url.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('state', url.searchParams.get('state')!); redirect.searchParams.set('iss', issuer);
      if (config.denied) redirect.searchParams.set('error', 'access_denied');
      else {
        const code = crypto.randomUUID(); codes.set(code, { challenge: url.searchParams.get('code_challenge')!, redirect: redirect.origin + redirect.pathname, resource: url.searchParams.get('resource')! });
        redirect.searchParams.set('code', code);
      }
      return new Response(null, { status: 302, headers: { location: redirect.href } });
    }
    if (url.pathname === '/token') {
      effects.token++;
      if (config.redirectToken) return new Response(null, { status: 307, headers: { location: 'https://intruder.example/token' } });
      const form = new URLSearchParams(await request.text());
      if (config.requireClientPost) {
        const valid = !request.headers.has('authorization') && form.get('client_secret') === 'registered-secret';
        effects.authentication.push(valid ? 'post' : 'other');
        if (!valid) return Response.json({ error: 'invalid_client' }, { status: 401 });
      }
      expect(form.get('resource')).toBe(resource);
      if (form.get('grant_type') === 'refresh_token') {
        effects.refresh++;
        if (config.refreshFailure) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      } else {
        const authorization = codes.get(form.get('code')!);
        if (!authorization) return Response.json({ error: 'invalid_grant' }, { status: 400 });
        codes.delete(form.get('code')!);
        expect(form.get('redirect_uri')).toBe(authorization.redirect);
        expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(authorization.challenge);
      }
      return Response.json({ access_token: 'secret-access-' + effects.token, refresh_token: 'secret-refresh-' + effects.token, token_type: 'Bearer', expires_in: 3600, ...(config.wrongTokenResource ? { resource: 'https://intruder.example' } : {}) });
    }
    return new Response(null, { status: 404 });
  } });
  const network: string[] = [];
  const fetch: FetchLike = async (input, init) => {
    const original = new URL(input); network.push(original.href);
    if (![issuer, new URL(resource).origin].includes(original.origin)) throw Error('Outside controlled service');
    return globalThis.fetch(new URL(original.pathname + original.search, server.url), { ...init, redirect: 'manual' });
  };
  return { config, effects, fetch, network, close() { server.stop(true); } };
}
async function approve(connection: ReturnType<ReturnType<typeof createPluginOAuthManager>['connection']>, remote: Awaited<ReturnType<typeof service>>) {
  const login = await connection.login();
  expect(login.state).toBe('awaiting-approval');
  const response = await remote.fetch(login.authorizationUrl!);
  return new URL(response.headers.get('location')!);
}
function persistedStore(): PluginCredentialStore {
  const session = createSessionCredentialStore();
  return { ...session, mode: 'os' };
}
test('SDK login binds PKCE/resource/issuer, persists credentials and never exposes secrets', async () => {
  const remote = await service(), credentials = persistedStore();
  try {
    const manager = createPluginOAuthManager({ credentials, redirectUrl: () => callback, fetch: remote.fetch });
    const connection = manager.connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect(await connection.provider.tokens()).toBeUndefined();
    expect(connection.status().state).toBe('auth-required');
    const result = await manager.callback(await approve(connection, remote));
    expect(result.state).toBe('authorized');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(remote.effects.registration).toBe(0);
    const restarted = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect((await restarted.provider.tokens())?.access_token).toBe('secret-access-1');
    expect(restarted.status().state).toBe('authorized');
  } finally { remote.close(); }
});
test('callbacks reject cross-instance, wrong issuer, replay and cancellation', async () => {
  const remote = await service();
  try {
    const manager = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch });
    const first = manager.connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const other = manager.connection({ installationId: 'two', serverName: 'remote', serverUrl: resource });
    const returned = await approve(first, remote);
    await expect(other.callback(returned)).rejects.toThrow();
    const wrongIssuer = new URL(returned); wrongIssuer.searchParams.set('iss', 'https://intruder.example');
    await expect(first.callback(wrongIssuer)).rejects.toThrow();
    const fresh = await approve(first, remote);
    expect((await first.callback(fresh)).state).toBe('authorized');
    await expect(first.callback(fresh)).rejects.toThrow();
    const cancelled = await approve(first, remote); first.cancel();
    await expect(manager.callback(cancelled)).rejects.toThrow();
    expect(remote.effects.token).toBe(1);
  } finally { remote.close(); }
});
test('denial and insecure or substituted metadata never exchange tokens', async () => {
  const remote = await service();
  try {
    const make = () => createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    remote.config.denied = true;
    const denied = make(); expect((await denied.callback(await approve(denied, remote))).state).toBe('denied');
    remote.config.resource = 'https://intruder.example'; expect((await make().login()).state).toBe('failed');
    remote.config.resource = resource; remote.config.issuer = 'https://intruder.example'; expect((await make().login()).state).toBe('failed');
    remote.config.issuer = issuer; remote.config.badEndpoint = true; expect((await make().login()).state).toBe('failed');
    expect(remote.effects.token).toBe(0);
  } finally { remote.close(); }
});
test('refresh rotation is single-flight and failure requires explicit reconnect', async () => {
  const remote = await service();
  try {
    const connection = createPluginOAuthManager({ credentials: persistedStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    await connection.callback(await approve(connection, remote));
    await Promise.all([connection.refresh(), connection.refresh(), connection.refresh()]);
    expect(remote.effects.refresh).toBe(1);
    expect((await connection.provider.tokens())?.refresh_token).toBe('secret-refresh-2');
    remote.config.refreshFailure = true;
    expect((await connection.refresh()).state).toBe('refresh-failed');
    expect(await connection.provider.tokens()).toBeUndefined();
    expect(remote.effects.refresh).toBe(2);
  } finally { remote.close(); }
});
test('DCR, session restart and disconnect keep ownership separate', async () => {
  const remote = await service(), credentials = createSessionCredentialStore();
  try {
    remote.config.cimd = false;
    const connection = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    await connection.callback(await approve(connection, remote));
    expect(remote.effects.registration).toBe(1);
    expect(connection.status().credentialMode).toBe('session');
    const restart = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect(await restart.provider.tokens()).toBeUndefined();
    expect((await connection.disconnect()).state).toBe('disconnected');
    expect(await connection.provider.tokens()).toBeUndefined();
  } finally { remote.close(); }
});
test('restart disconnect removes credentials before a connection has loaded its tokens', async () => {
  const remote = await service(), credentials = persistedStore();
  try {
    const make = () => createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const first = make(); await first.callback(await approve(first, remote));
    expect((await make().disconnect()).state).toBe('disconnected');
    expect(await make().provider.tokens()).toBeUndefined();
  } finally { remote.close(); }
});
test('issuer identifiers retain their exact advertised trailing slash', async () => {
  const remote = await service();
  try {
    remote.config.issuer = issuer + '/'; remote.config.advertisedIssuer = issuer + '/';
    const connection = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect((await connection.login()).state).toBe('awaiting-approval');
    expect(connection.status().issuer).toBe(issuer + '/');
  } finally { remote.close(); }
});
test('expired callbacks, substituted token resources, and token redirects never authorize', async () => {
  const remote = await service();
  try {
    const make = () => createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const expired = make(), returned = await approve(expired, remote);
    const future = Date.now() + 6 * 60_000, now = spyOn(Date, 'now').mockReturnValue(future);
    try { await expect(expired.callback(returned)).rejects.toThrow(); } finally { now.mockRestore(); }
    expect(remote.effects.token).toBe(0);
    remote.config.wrongTokenResource = true;
    const wrong = make(); expect((await wrong.callback(await approve(wrong, remote))).state).toBe('failed');
    expect(await wrong.provider.tokens()).toBeUndefined();
    remote.config.wrongTokenResource = false; remote.config.redirectToken = true;
    const redirected = make(); expect((await redirected.callback(await approve(redirected, remote))).state).toBe('failed');
    expect(remote.network.some(url => url.includes('intruder'))).toBe(false);
  } finally { remote.close(); }
});
test('preconfigured client is issuer-bound and avoids dynamic registration', async () => {
  const remote = await service();
  try {
    remote.config.cimd = false;
    const make = (boundIssuer: string) => createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource, preconfiguredClient: { issuer: boundIssuer, information: { client_id: 'preconfigured' } } });
    expect((await make('https://intruder.example').login()).state).toBe('failed');
    const correct = make(issuer); expect((await correct.callback(await approve(correct, remote))).state).toBe('authorized');
    expect(remote.effects.registration).toBe(0);
  } finally { remote.close(); }
});
test('cancelling an in-flight code exchange cannot persist its late token response', async () => {
  const remote = await service(), credentials = persistedStore();
  let release!: () => void, arrived!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { arrived = resolve; });
  try {
    const fetch: FetchLike = async (url, init) => {
      const response = await remote.fetch(url, init);
      if (new URL(url).pathname === '/token') { arrived(); await blocked; }
      return response;
    };
    const connection = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const callbackResult = connection.callback(await approve(connection, remote));
    await started; connection.cancel(); release();
    expect((await callbackResult).state).toBe('cancelled');
    const restart = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect(await restart.provider.tokens()).toBeUndefined();
  } finally { release(); remote.close(); }
});
test('oversized discovery responses and storage failure never advertise authorization', async () => {
  const remote = await service();
  try {
    const oversized = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: async () => new Response('x'.repeat(1024 * 1024 + 1)) }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect((await oversized.login()).state).toBe('failed');
    const credentials: PluginCredentialStore = { mode: 'os', async get() { return undefined; }, async set() { throw Error('Unavailable'); }, async delete() {} };
    const connection = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect((await connection.callback(await approve(connection, remote))).state).toBe('failed');
    expect(await connection.provider.tokens()).toBeUndefined();
  } finally { remote.close(); }
});
test('late cancelled exchange cannot clear a newer login callback', async () => {
  const remote = await service();
  let release!: () => void, arrived!: () => void, firstToken = true;
  const blocked = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { arrived = resolve; });
  try {
    const fetch: FetchLike = async (url, init) => {
      const response = await remote.fetch(url, init);
      if (new URL(url).pathname === '/token' && firstToken) { firstToken = false; arrived(); await blocked; }
      return response;
    };
    const connection = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const old = connection.callback(await approve(connection, remote));
    await started; connection.cancel();
    const fresh = await approve(connection, remote);
    release(); await old;
    expect((await connection.callback(fresh)).state).toBe('authorized');
  } finally { release(); remote.close(); }
});
test('loopback HTTP MCP resources can use HTTPS authorization endpoints', async () => {
  const localResource = 'http://127.0.0.1:43219/mcp', remote = await service(localResource);
  try {
    const connection = createPluginOAuthManager({ credentials: createSessionCredentialStore(), redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'local', serverUrl: localResource });
    expect((await connection.callback(await approve(connection, remote))).state).toBe('authorized');
  } finally { remote.close(); }
});
test.each(['credential read', 'refresh'] as const)('cancellation during %s prevents an in-flight tokens read from returning credentials', async boundary => {
  const remote = await service(), saved = persistedStore();
  let release!: () => void, arrived!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { arrived = resolve; });
  try {
    const original = createPluginOAuthManager({ credentials: saved, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    await original.callback(await approve(original, remote));
    const credentials: PluginCredentialStore = { ...saved, async get(key) {
      const value = await saved.get(key);
      if (boundary === 'credential read') { arrived(); await blocked; return value; }
      return value === undefined ? undefined : JSON.stringify({ ...JSON.parse(value), expiresAt: 0 });
    } };
    const fetch: FetchLike = async (url, init) => {
      const response = await remote.fetch(url, init);
      if (boundary === 'refresh' && new URL(url).pathname === '/token') { arrived(); await blocked; }
      return response;
    };
    const connection = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    const tokens = connection.provider.tokens();
    await started; connection.cancel(); release();
    expect(await tokens).toBeUndefined();
    expect(connection.status().state).toBe('cancelled');
  } finally { release(); remote.close(); }
});
test.each(['preconfigured', 'registered'] as const)('%s client POST authentication survives refresh and restart', async registration => {
  const remote = await service(), credentials = persistedStore();
  try {
    remote.config.cimd = false; remote.config.requireClientPost = true;
    const connection = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({
      installationId: 'one', serverName: 'remote', serverUrl: resource,
      ...(registration === 'preconfigured' ? { preconfiguredClient: { issuer, information: {
        client_id: 'registered-client', client_secret: 'registered-secret', token_endpoint_auth_method: 'client_secret_post', redirect_uris: [callback],
      } } } : {}),
    });
    expect((await connection.callback(await approve(connection, remote))).state).toBe('authorized');
    expect((await connection.refresh()).state).toBe('authorized');
    const restarted = createPluginOAuthManager({ credentials, redirectUrl: callback, fetch: remote.fetch }).connection({ installationId: 'one', serverName: 'remote', serverUrl: resource });
    expect((await restarted.refresh()).state).toBe('authorized');
    expect(remote.effects.authentication).toEqual(['post', 'post', 'post']);
  } finally { remote.close(); }
});
