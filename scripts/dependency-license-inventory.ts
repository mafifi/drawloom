/** Read-only dependency inspection; writes only an ignored inventory artifact. */
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { parseConfigFileTextToJson } from "typescript";
import {
  KnownLlamaRuntime,
  KnownModelManifests,
} from "../packages/knowledge/local-embeddings/src/manifest.js";
import { runtimeDependencies } from "./runtime-dependencies.js";
const root = resolve(import.meta.dir, "..");
const lock = parseConfigFileTextToJson(
  "bun.lock",
  readFileSync(join(root, "bun.lock"), "utf8"),
).config;
const installed = new Map<string, any[]>(),
  visited = new Set<string>();
function scan(modules: string) {
  if (!existsSync(modules)) return;
  for (const name of readdirSync(modules)) {
    if (name.startsWith(".")) continue;
    const candidates = name.startsWith("@")
      ? readdirSync(join(modules, name)).map((n) => join(modules, name, n))
      : [join(modules, name)];
    for (const candidate of candidates) {
      if (!existsSync(join(candidate, "package.json"))) continue;
      const path = realpathSync(candidate);
      if (visited.has(path)) continue;
      visited.add(path);
      const p = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
      const key = p.name + "@" + p.version;
      installed.set(key, [...(installed.get(key) ?? []), { path, p }]);
      scan(join(path, "node_modules"));
    }
  }
}
scan(join(root, "node_modules"));
function legalFiles(path: string) {
  const result: string[] = [];
  function walk(dir: string, depth: number, legal = false) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && /^(licen[sc]e|copying|copyright|notice|third.party)/i.test(e.name))
        result.push(relative(root, join(dir, e.name)));
      else if (
        e.isDirectory() &&
        depth < 5 &&
        (legal || /^(licen[sc]es?|legal|dist|vendor)$/i.test(e.name))
      )
        walk(join(dir, e.name), depth + 1, legal || /^(licen[sc]es?|legal)$/i.test(e.name));
    }
  }
  walk(path, 0);
  const temporalSdkLicense = join(path, "sdk-core", "LICENSE.txt");
  if (
    existsSync(temporalSdkLicense) &&
    JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name === "@temporalio/core-bridge"
  )
    result.push(relative(root, temporalSdkLicense));
  return result;
}
const manifests = execFileSync("git", ["ls-files", "-z", "*package.json"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)
  .map((path) => ({ path, ...JSON.parse(readFileSync(join(root, path), "utf8")) }));
const direct = manifests.flatMap((m) =>
  ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"].flatMap((kind) =>
    Object.entries(m[kind] ?? {})
      .filter(([n]) => !n.startsWith("@drawloom/"))
      .map(([name, range]) => ({ manifest: m.path, kind, name, range })),
  ),
);
const runtime = new Set<string>(),
  unresolvedRuntime: any[] = [],
  runtimePaths = new Map<string, string[]>();
function resolvePackage(name: string, from: string) {
  for (let dir = from; ; dir = dirname(dir)) {
    const path = join(dir, "node_modules", name);
    if (existsSync(join(path, "package.json"))) return realpathSync(path);
    if (dir === dirname(dir)) return;
  }
}
const reached = new Set<string>();
function closure(path: string, parents: string[] = []) {
  if (reached.has(path)) return;
  reached.add(path);
  const p = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  const chain = [...parents, p.name + "@" + p.version];
  if (!p.name.startsWith("@drawloom/")) {
    runtime.add(p.name + "@" + p.version);
    runtimePaths.set(p.name + "@" + p.version, chain);
  }
  for (const { name, optional } of runtimeDependencies(p)) {
    const found = resolvePackage(name, path);
    if (found) closure(found, chain);
    else unresolvedRuntime.push({ from: p.name, name, optional });
  }
}
for (const m of manifests.filter((m) => /^(apps|packages)\//.test(m.path)))
  closure(dirname(join(root, m.path)));
const npm = [
  ...new Map(
    Object.values(lock.packages)
      .filter((v: any) => typeof v[0] === "string" && !v[0].startsWith("workspace:"))
      .map((v: any) => [v[0], v]),
  ).entries(),
].map(([key, v]: any) => {
  const found = installed.get(key)?.[0],
    split = key.lastIndexOf("@"),
    name = key.slice(0, split),
    version = key.slice(split + 1);
  return {
    name,
    version,
    integrity: v.at(-1),
    license: found?.p.license ?? found?.p.licenses ?? null,
    legalFiles: found ? legalFiles(found.path) : [],
    installed: !!found,
    runtimePath: runtimePaths.get(key),
    distribution: runtime.has(key)
      ? "runtime candidate; confirm against release artifact"
      : "not in installed runtime closure; may be dev, peer or another platform",
    directDeclarations: direct.filter((d) => d.name === name),
  };
});
const cargo = Bun.TOML.parse(
  readFileSync(join(root, "apps/desktop/src-tauri/Cargo.lock"), "utf8"),
) as any;
const registry = join(process.env.HOME ?? "", ".cargo/registry/src");
const cargoRoots = existsSync(registry) ? readdirSync(registry).map((p) => join(registry, p)) : [];
const rust = cargo.package
  .filter((p: any) => p.source)
  .map((p: any) => {
    const directory = cargoRoots
      .map((r) => join(r, p.name + "-" + p.version))
      .find((r) => existsSync(join(r, "Cargo.toml")));
    const metadata = directory
      ? (Bun.TOML.parse(readFileSync(join(directory, "Cargo.toml"), "utf8")) as any).package
      : undefined;
    return {
      name: p.name,
      version: p.version,
      checksum: p.checksum,
      license: metadata?.license ?? null,
      legalFiles: directory ? legalFiles(directory) : [],
      distribution: "native shell lock entry; target/build inclusion not resolved",
    };
  });
const supportedModel = KnownModelManifests["qwen3-embedding-0.6b-gguf"];
const runtimeBuildAuthority = "scripts/build-llama-runtime.sh";
const runtimeBuildRevision = readFileSync(join(root, runtimeBuildAuthority), "utf8").match(
  /^expected_revision=([a-f0-9]{40})$/m,
)?.[1];
if (runtimeBuildRevision !== KnownLlamaRuntime.revision)
  throw Error("llama.cpp build revision does not match the supported runtime manifest");
const externalArtifacts = [
  {
    kind: "native-runtime",
    id: KnownLlamaRuntime.id,
    revision: KnownLlamaRuntime.revision,
    sha256: KnownLlamaRuntime.sha256,
    binarySha256: KnownLlamaRuntime.binarySha256,
    authority: "packages/knowledge/local-embeddings/src/manifest.ts#KnownLlamaRuntime",
    buildAuthority: runtimeBuildAuthority,
    bundled: false,
    releaseReview: "required",
  },
  ...supportedModel.artifacts.map((artifact) => ({
    kind: "model",
    id: supportedModel.id,
    revision: supportedModel.revision,
    path: artifact.path,
    bytes: artifact.bytes,
    sha256: artifact.sha256,
    authority: "packages/knowledge/local-embeddings/src/manifest.ts#KnownModelManifests",
    bundled: false,
    releaseReview: "required",
  })),
];
const counts = (items: any[]) =>
  Object.fromEntries(
    [
      ...new Set(
        items.map((p) =>
          typeof p.license === "string"
            ? p.license
            : p.license
              ? JSON.stringify(p.license)
              : "UNRESOLVED",
        ),
      ),
    ].map((k) => [
      k,
      items.filter(
        (p) =>
          (typeof p.license === "string"
            ? p.license
            : p.license
              ? JSON.stringify(p.license)
              : "UNRESOLVED") === k,
      ).length,
    ]),
  );
const output = process.env.DRAWLOOM_LICENSE_INVENTORY_OUTPUT
  ? resolve(process.env.DRAWLOOM_LICENSE_INVENTORY_OUTPUT)
  : join(root, "docs/reference/evidence/generated/dependency-licenses");
mkdirSync(output, { recursive: true });
const result = {
  baseRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope:
    "Locked dependencies, local installed metadata and manifest-routed external artifact identities. Not an artifact SBOM or licence clearance.",
  npm,
  rust,
  externalArtifacts,
  unresolvedRuntime,
  summary: {
    npm: npm.length,
    runtimeCandidates: npm.filter((p) => runtime.has(p.name + "@" + p.version)).length,
    npmLicenses: counts(npm),
    rust: rust.length,
    rustLicenses: counts(rust),
    externalArtifacts: externalArtifacts.length,
  },
};
writeFileSync(join(output, "inventory.json"), JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      npm: npm.length,
      runtimeCandidates: result.summary.runtimeCandidates,
      rust: rust.length,
      externalArtifacts: externalArtifacts.length,
      output: relative(root, output),
    },
    null,
    2,
  ),
);
