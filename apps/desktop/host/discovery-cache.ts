/** Connection readiness must not block registered contribution presentation. */
export function createDiscoveryCache<T>(
  read: (refresh: boolean) => Promise<T>,
) {
  type Snapshot = { status: 'loading' | 'available' | 'error'; value?: T };
  let snapshot: Snapshot | undefined;
  let pending = false;
  return {
    read(refresh = false, current?: T): Snapshot {
      // Execution/restore may have connected successfully after our failed read.
      if (current !== undefined) return { status: 'available', value: current };
      if (!pending && (!snapshot || refresh)) {
        pending = true;
        snapshot = { status: 'loading' };
        void Promise.resolve()
          .then(() => read(refresh))
          .then(
            (value) => {
              snapshot = { status: 'available', value };
            },
            () => {
              snapshot = { status: 'error' };
            },
          )
          .finally(() => {
            pending = false;
          });
      }
      return snapshot!;
    },
  };
}
