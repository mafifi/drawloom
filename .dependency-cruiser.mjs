import { readFileSync } from "node:fs";

const { privatePackagePattern } = JSON.parse(
  readFileSync(
    new URL("./scripts/public-boundary-policy.json", import.meta.url),
    "utf8",
  ),
);
const privatePackagePath = privatePackagePattern.slice(1);

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
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
      path: `(^|/)node_modules/(?!${privatePackagePath})`,
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
  },
};
