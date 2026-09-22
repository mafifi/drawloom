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
      // Tool-local dot-directories, none of which is tracked: `.superpowers`
      // holds snapshot archives from earlier sessions, and `.claude/worktrees`
      // holds live agent worktrees — full copies of the repository being edited
      // while the sweep runs. Both put hundreds of stale or in-flight test
      // copies on disk, and running them makes the gate report failures for
      // work that is not in the repository.
      //
      // Excluded as a CLASS rather than by name, because the last one was fixed
      // by name and the next one appeared anyway. No tracked test file lives in
      // a dot-directory; `scripts/node-test-lanes.mjs` already skips them all
      // for the same reason.
      "**/.*/**",
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
