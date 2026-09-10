import { readFileSync, readdirSync, existsSync } from "node:fs";

const { privatePackagePattern } = JSON.parse(
  readFileSync(
    new URL("./scripts/public-boundary-policy.json", import.meta.url),
    "utf8",
  ),
);
const privatePackagePath = privatePackagePattern.slice(1);
const packages = (
  existsSync("packages") ? readdirSync("packages", { withFileTypes: true }) : []
)
  .filter((entry) => entry.isDirectory())
  .flatMap((group) =>
    readdirSync(`packages/${group.name}`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const path = `packages/${group.name}/${entry.name}/`;
        return {
          path,
          ...JSON.parse(readFileSync(`${path}package.json`, "utf8")).drawloom,
        };
      }),
  );
const paths = (entries) => entries.map((entry) => entry.path).join("|");
const providerPaths = paths(
  packages.filter((entry) => ["provider", "composition"].includes(entry.role)),
);

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    ...packages
      .filter((entry) => ["contract", "consumer"].includes(entry.role))
      .map((entry) => ({
        name: `no-contract-provider-${entry.path.replaceAll("/", "-")}`,
        severity: "error",
        from: { path: `^${entry.path}`, pathNot: "\\.test\\." },
        to: { path: `^(?:${providerPaths})` },
      })),
    ...packages
      .filter((entry) => entry.role === "provider")
      .map((entry) => ({
        name: `no-provider-provider-${entry.path.replaceAll("/", "-")}`,
        severity: "error",
        from: { path: `^${entry.path}`, pathNot: "\\.test\\." },
        to: {
          path: `^(?:${paths(packages.filter((other) => other.path !== entry.path && ["provider", "composition"].includes(other.role)))})`,
        },
      })),
    ...packages
      .filter((entry) => entry.runtime === "portable")
      .map((entry) => ({
        name: `no-portable-host-${entry.path.replaceAll("/", "-")}`,
        severity: "error",
        from: { path: `^${entry.path}`, pathNot: "\\.test\\." },
        to: { dependencyTypes: ["core"] },
      })),
    {
      name: "no-private-product-imports",
      severity: "error",
      comment:
        "Public Drawloom must not import private product or plugin packages.",
      from: {},
      to: {
        path: `(?:^|/)node_modules/${privatePackagePath}|${privatePackagePattern}`,
      },
    },
    {
      name: "no-source-outside-checkout",
      severity: "error",
      comment:
        "Source imports must not reach into sibling or absolute-path checkouts.",
      from: {},
      to: { path: "^(?:\\.\\./|/|[A-Za-z]:[/\\\\])" },
    },
    {
      name: "orchestration-spike-portable-authoring",
      severity: "error",
      comment:
        "ADR 0017 plugin definitions use only candidate interfaces, portable agent schemas and Zod. Keep Temporal, handlers and host APIs in the proof adapter.",
      from: {
        path: "^spikes/adr-0017-orchestration/(?:contract|fixtures|owned-agent)\\.ts$",
      },
      to: {
        pathNot:
          "^(?:spikes/adr-0017-orchestration/(?:contract|fixtures|owned-agent)\\.ts$|@drawloom/agent$|packages/agent/agent/|node_modules/(?:zod/|@drawloom/agent/))",
      },
    },
    {
      name: "no-import-from-spikes",
      severity: "error",
      comment:
        "Retained spike code is evidence, not a supported implementation surface.",
      from: {
        pathNot: "^spikes/",
      },
      to: {
        path: "^spikes/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      // Keep known private imports visible to the rule even when installed.
      path: `(^|/)node_modules/(?!${privatePackagePath})|^spikes/adr-0017-orchestration/dist/|^apps/desktop/(?:build/|\.svelte-kit/|src-tauri/(?:target/|binaries/))`,
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
  },
};
