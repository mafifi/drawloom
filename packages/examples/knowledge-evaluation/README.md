# `@drawloom/knowledge-evaluation`

A public composition example: it installs a fixed, target-free assessment of
Drawloom's frozen public knowledge evidence. Read this before using it as a
template for your own evaluation plugin, or before changing what it claims to
cover.

It presents the supported `EvaluationWorkbench` through standard MCP Apps and
delegates evaluation, orchestration, storage and assessment execution to the
trusted host—this package contains no target implementation, model selection,
model artifact, download path, private fixture or spike import.

## What it evaluates

The seven immutable `assess_existing` definitions cover 122 saved-output case
instances: 48 current retrieval cases, 72 retained historical answer cases
and 2 synthetic regression cases. Comparable retrieval definitions share the
same logical case identities, revisions, inputs, expected material and
scorer versions, so results line up across them. Current MLX retrieval stays
labelled separately from historical CPU answers, and required-chain results
describe retained top-k coverage, not evidence API traversal.

Feedback is advisory persisted metadata; it does not alter findings or accept
the underlying source work.

## Build and test

Build and run the focused verification from the repository root:

```sh
pnpm --filter ./packages/examples/knowledge-evaluation run build
pnpm vitest run packages/examples/knowledge-evaluation/knowledge.test.ts \
  packages/examples/knowledge-evaluation/backend.test.ts \
  packages/examples/knowledge-evaluation/client.test.ts \
  packages/examples/knowledge-evaluation/build.test.ts \
  packages/examples/knowledge-evaluation/app.browser.test.ts \
  packages/examples/knowledge-evaluation/installed.integration.test.ts \
  packages/examples/knowledge-evaluation/real-temporal.integration.test.ts
```

The mounted browser and real-Temporal tests skip in default CI.

Run the mounted Svelte regression only with a preinstalled
Playwright-compatible Chromium (or set `DRAWLOOM_CHROMIUM_EXECUTABLE` to
one). The test never downloads a browser:

```sh
DRAWLOOM_BROWSER_TEST=1 pnpm vitest run \
  packages/examples/knowledge-evaluation/app.browser.test.ts
```

Run the installed real-Temporal restart and reconciliation proof only when
the repository's pinned Temporal and Node runtimes are available:

```sh
DRAWLOOM_TEMPORAL_TEST=1 pnpm vitest run \
  packages/examples/knowledge-evaluation/real-temporal.integration.test.ts
```

See [`@drawloom/evaluation`](../../evaluation/evaluation/README.md) and
[ADR 0025](../../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md)
for the contract this example composes against.
