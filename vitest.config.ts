import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Workspace packages publish `dist`, but development and tests read `src`
// directly through the `drawloom-source` export condition. Resolution for
// development and resolution for publishing are deliberately separate: the
// condition is only ever supplied here and by `node --conditions`, so packed
// consumers and deployed sidecars fall back to `dist` exactly as a published
// consumer would.
export default defineConfig({
  // Compiles `.svelte` components and `.svelte.ts` rune modules. Under Bun each
  // such test hand-rolled its own loader plugin; the standard plugin replaces them.
  plugins: [svelte({ configFile: false })],
  resolve: {
    conditions: ["drawloom-source", "svelte"],
  },
  ssr: {
    resolve: {
      conditions: ["drawloom-source", "svelte"],
    },
    // Dependencies that ship stylesheets must go through Vite. Externalised to
    // Node they reach the runtime as bare `.css` imports, which it cannot load.
    noExternal: ["katex"],
  },
  test: {
    // `.mjs` suites are deliberately NOT collected here. They are the real-Node
    // lane: `node --test` runs them against built, packed or deployed files,
    // outside Vite's transformations, so that published exports, native modules
    // and packaged resource paths are exercised as a user would get them.
    // Consolidating them into Vitest would consolidate away what they prove.
    include: ["**/*.test.{ts,js}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.svelte-kit/**",
      "spikes/**",
      // Local, untracked snapshot archives from earlier sessions. They contain
      // copies of real test files that no longer compile against current
      // sources. `.dependency-cruiser.mjs` already excludes this path; the test
      // runner must too, or a developer with these on disk fails the gate for
      // work that is not in the repository.
      "**/.superpowers/**",
      // deployed installations contain a copy of the sources they were built from
      "**/.deploy/**",
      "**/*.test.mjs",
    ],
    // Host suites start real child processes (codex, the knowledge sidecar).
    // Five seconds is a unit-test budget, not an integration one.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
