export default async ({ capabilities }) => {
  if (!capabilities.host || !capabilities.orchestration) throw Error('Declared capabilities unavailable');
  const store = capabilities.host.store;
  await store.set('activations', ((await store.get('activations')) ?? 0) + 1);
  return {
    taskHandlers: [{ id: 'catalog-label', version: '1', async run(value) {
      await store.set('counter', ((await store.get('counter')) ?? 0) + 1);
      return value.trim().toUpperCase();
    } }],
    async dispose() {},
  };
};
