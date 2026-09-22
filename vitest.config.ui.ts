import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The browser acceptance lane (`pnpm run test:ui`). It is real Vitest, reusing
// the same Svelte/`drawloom-source` resolution as vitest.config.ts's default
// sweep so it can import desktop host and package sources the same way — that
// resolution is exactly what plain `node scripts/test-ui-browser.ts` lacked
// (see F11 in docs/plans/pre-publication-audit.md).
//
// This is a deliberately SEPARATE config and command, not folded into the
// default sweep. `mergeConfig` was tried first and rejected: Vitest/Vite's
// merge concatenates array options like `test.include` rather than replacing
// them, so a merged config re-ran the *entire* default sweep in addition to
// this file. Duplicating the shared plugin/resolve setup here, with its own
// `include` naming only this one script, keeps `test:ui` a slow standalone
// Playwright/Chromium lane that never joins `pnpm run test` or `check:ci`'s
// `test` step. CI runs it as its own job.
export default defineConfig({
  plugins: [svelte({ configFile: false })],
  resolve: {
    conditions: ["drawloom-source", "svelte"],
  },
  ssr: {
    resolve: {
      conditions: ["drawloom-source", "svelte"],
    },
    noExternal: ["katex"],
  },
  test: {
    include: ["scripts/test-ui-browser.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
