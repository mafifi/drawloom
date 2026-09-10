export interface PluginCredentialStore {
  readonly mode: 'os' | 'session';
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export interface NativeCredentialEntry {
  getPassword(): Promise<string | undefined>;
  setPassword(value: string): Promise<void>;
  deleteCredential(): Promise<boolean>;
}
export function createSessionCredentialStore(): PluginCredentialStore {
  const values = new Map<string, string>();
  return { mode: 'session', async get(key) { return values.get(key); }, async set(key, value) { values.set(key, value); }, async delete(key) { values.delete(key); } };
}
export function createNativeCredentialStore(entry: (key: string) => NativeCredentialEntry): PluginCredentialStore {
  const session = createSessionCredentialStore();
  let mode: 'os' | 'session' = 'os';
  return {
    get mode() { return mode; },
    async get(key) {
      if (mode === 'session') return session.get(key);
      try { return await entry(key).getPassword(); }
      catch { mode = 'session'; return session.get(key); }
    },
    async set(key, value) {
      if (mode === 'os') {
        try { await entry(key).setPassword(value); return; }
        catch { mode = 'session'; }
      }
      await session.set(key, value);
    },
    async delete(key) {
      await session.delete(key);
      // A lock/failure must never claim that previously persisted credentials vanished.
      try { await entry(key).deleteCredential(); }
      catch { mode = 'session'; throw Error('Credential deletion unavailable'); }
    },
  };
}
export async function createPluginCredentialStore(): Promise<PluginCredentialStore> {
  if (process.platform !== 'darwin') return createSessionCredentialStore();
  try {
    const { AsyncEntry } = await import('@napi-rs/keyring');
    return createNativeCredentialStore(key => new AsyncEntry('io.github.mafifi.drawloom.mcp-oauth', key));
  } catch { return createSessionCredentialStore(); }
}
