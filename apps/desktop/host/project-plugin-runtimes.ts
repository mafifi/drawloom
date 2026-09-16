import type { DirectoryProject } from "../src/lib/protocol.js";
import { DesktopClosedError } from "./application-lifecycle.js";

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
  let stopped = false;
  let closing: Promise<void> | undefined;

  async function construct(binding?: DirectoryProject) {
    const activated = binding ? await options.available(binding) : false;
    return options.create(binding, activated);
  }

  function forProject(binding?: DirectoryProject): Promise<T> {
    if (stopped) return Promise.reject(new DesktopClosedError("closing"));
    const key = binding?.id ?? "legacy";
    let runtime = runtimes.get(key);
    if (!runtime) {
      runtime = construct(binding);
      runtimes.set(key, runtime);
    }
    const current = runtime;
    return current.then(async (value) => {
      if (stopped) throw new DesktopClosedError("closing");
      if (!binding || value.activated) return value;
      const available = await options.available(binding);
      if (stopped) throw new DesktopClosedError("closing");
      if (!available) return value;
      const latest = runtimes.get(key)!;
      if (latest !== current) {
        const active = await latest;
        if (stopped) throw new DesktopClosedError("closing");
        return active;
      }
      const starting = options.replace(value).then(() => construct(binding));
      runtimes.set(key, starting);
      const active = await starting;
      if (stopped) throw new DesktopClosedError("closing");
      return active;
    });
  }

  return {
    forProject,
    stopAdmission() {
      stopped = true;
    },
    pending: (projectId: string) => runtimes.get(projectId),
    retire: (retire: (runtime: T) => Promise<void>) => retireCreatedRuntimes(runtimes, retire),
    close: () => {
      stopped = true;
      return (closing ??= retireCreatedRuntimes(runtimes, options.close));
    },
  };
}
