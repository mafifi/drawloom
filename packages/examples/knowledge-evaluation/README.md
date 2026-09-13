# `@drawloom/knowledge-evaluation`

This public composition package installs a fixed, target-free assessment of
Drawloom's frozen public knowledge evidence. It presents the supported
`EvaluationWorkbench` through standard MCP Apps and delegates evaluation,
orchestration, storage and assessment execution to the trusted host.

The seven immutable `assess_existing` definitions contain 122 saved-output case
instances: 48 current retrieval cases, 72 retained historical answer cases and
two synthetic regression cases. Comparable retrieval definitions share the same
logical case identities, revisions, inputs, expected material and scorer
versions. Current MLX retrieval remains labelled separately from historical CPU
answers. Required-chain results describe retained top-k coverage, not evidence
API traversal.

The package contains no target implementation, model selection, model artifact,
download path, private fixture or spike import. Feedback is advisory persisted
metadata; it does not alter findings or accept source work.

Build and focused verification from the repository root:

```sh
bun run --cwd packages/examples/knowledge-evaluation build
bun test packages/examples/knowledge-evaluation/knowledge.test.ts \
  packages/examples/knowledge-evaluation/backend.test.ts \
  packages/examples/knowledge-evaluation/client.test.ts \
  packages/examples/knowledge-evaluation/build.test.ts \
  packages/examples/knowledge-evaluation/app.browser.test.ts \
  packages/examples/knowledge-evaluation/installed.integration.test.ts \
  packages/examples/knowledge-evaluation/real-temporal.integration.test.ts
```

The mounted browser and real-Temporal tests skip in default CI. Run the mounted
Svelte regression only with a preinstalled Playwright-compatible Chromium (or
set `DRAWLOOM_CHROMIUM_EXECUTABLE` to one). The test never downloads a browser:

```sh
DRAWLOOM_BROWSER_TEST=1 bun test \
  packages/examples/knowledge-evaluation/app.browser.test.ts
```

Run the installed real-Temporal restart and reconciliation proof only when the
repository's pinned Temporal and Node runtimes are available:

```sh
DRAWLOOM_TEMPORAL_TEST=1 bun test \
  packages/examples/knowledge-evaluation/real-temporal.integration.test.ts
```
