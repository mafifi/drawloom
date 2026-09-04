/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
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
      path: "(^|/)node_modules/",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    tsPreCompilationDeps: true,
  },
};
