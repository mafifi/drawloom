/** A slow optional provider read must not hide already registered contributions. */
export async function readProviderDiscovery<T>(read: () => Promise<T>, timeoutMs = 8_000): Promise<
  { status: 'ok'; value: T } | { status: 'unavailable' }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read).then(value => ({ status: 'ok' as const, value }), () => ({ status: 'unavailable' as const })),
      new Promise<{ status: 'unavailable' }>(resolve => { timer = setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
