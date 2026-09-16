import type { DirectoryProject } from "../src/lib/protocol.js";

export async function retireCreatedRuntimes<T>(
  runtimes: ReadonlyMap<string, Promise<T>>,
  retire: (runtime: T) => Promise<void>,
) {
  const retired = new Map<string, Promise<T>>();
  const errors: unknown[] = [];
  while (true) {
    const created = [...runtimes].filter(([key, runtime]) => retired.get(key) !== runtime);
    if (!created.length) {
      if (errors.length) throw new AggregateError(errors, "Project runtime cleanup failed");
      return;
    }
    const results = await Promise.allSettled(
      created.map(async ([, runtime]) => retire(await runtime)),
    );
    for (const result of results) if (result.status === "rejected") errors.push(result.reason);
    for (const [key, runtime] of created) retired.set(key, runtime);
  }
}

export function createProjectPluginRuntimes<T extends { activated: boolean }>(options: {
  available: (binding: DirectoryProject) => Promise<boolean>;
  create: (binding: DirectoryProject | undefined, activated: boolean) => Promise<T>;
  replace: (runtime: T) => Promise<void>;
  close: (runtime: T) => Promise<void>;
}) {
  const runtimes = new Map<string, Promise<T>>();

  async function construct(binding?: DirectoryProject) {
    const activated = binding ? await options.available(binding) : false;
    return options.create(binding, activated);
  }

  function forProject(binding?: DirectoryProject): Promise<T> {
    const key = binding?.id ?? "legacy";
    let runtime = runtimes.get(key);
    if (!runtime) {
      runtime = construct(binding);
      runtimes.set(key, runtime);
    }
    const current = runtime;
    return current.then(async (value) => {
      if (!binding || value.activated || !(await options.available(binding))) return value;
      const latest = runtimes.get(key)!;
      if (latest !== current) return latest;
      const starting = options.replace(value).then(() => construct(binding));
      runtimes.set(key, starting);
      return starting;
    });
  }

  return {
    forProject,
    pending: (projectId: string) => runtimes.get(projectId),
    retire: (retire: (runtime: T) => Promise<void>) => retireCreatedRuntimes(runtimes, retire),
    close: () => retireCreatedRuntimes(runtimes, options.close),
  };
}
