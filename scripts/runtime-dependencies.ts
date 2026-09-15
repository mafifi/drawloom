interface Manifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
}
/** Edges that can enter a product installation, including installed peers. */
export function runtimeDependencies(manifest: Manifest): { name: string; optional: boolean }[] {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  }).map((name) => ({
    name,
    optional:
      name in (manifest.optionalDependencies ?? {}) ||
      (!(name in (manifest.dependencies ?? {})) &&
        manifest.peerDependenciesMeta?.[name]?.optional === true),
  }));
}
