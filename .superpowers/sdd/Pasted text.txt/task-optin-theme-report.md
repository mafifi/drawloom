# Opt-in evaluation viewer theme correction

## Scope

- Public Drawloom checkout at `/Users/afifim/Development/drawloom`.
- Base requested by the brief: `c3b584808604b0e60fdbea5703446047596ca0d9`.
- One test-only correction in `packages/examples/knowledge-evaluation/app.browser.test.ts`.
- No production theme/UI changes, dependency changes, private-repository work, native/build-host/sign checks, full canonical gate, paid models, or additional agents.

## Change evidence

The stale literal RGB expectations were replaced with browser-resolved semantic checks. In each emulated mode, the test compares the rendered `document.body` background with a temporary element resolving `var(--background)`. The dark-mode result must differ from the light-mode result, so a missing theme transition remains a failure. The test restores the emulated light mode in a `finally` block before closing the browser.

Loading, review, and button assertions are unchanged. No color parser, arbitrary palette, or production code was added.

## Checks and results

| Check | Result |
| --- | --- |
| `DRAWLOOM_BROWSER_TEST=1 pnpm exec vitest run packages/examples/knowledge-evaluation/app.browser.test.ts` | PASS: 2 test files/cases in the target file, 2 passed |
| `pnpm exec biome check packages/examples/knowledge-evaluation/app.browser.test.ts` | PASS: checked 1 file; no fixes |
| `pnpm exec tsc --noEmit -p packages/examples/knowledge-evaluation/tsconfig.json` | PASS |
| `git diff --check` | PASS |

The original failure was reproduced in the supplied evidence log: Chromium returned `oklch(1 0 0)` while the assertion expected `rgb(255, 255, 255)`. The first semantic-token comparison also exposed browser serialization (`oklch(100% 0 0)` versus `oklch(1 0 0)`); the final temporary-element resolution removes that representation mismatch without weakening the semantic assertion.

## Negative proof and limits

- A body background that does not follow the active semantic `--background` fails the per-mode equality assertion.
- A missing light-to-dark transition fails the explicit `dark.rendered !== light.rendered` assertion.
- The test was not run with a deliberate source mutation; negative behavior is reasoned from these executable assertions.
- This is focused evidence only. Main owns the full/native/build-host/sign gates and any remaining integration evidence.

## Working-tree boundary

Only the test file and this report are part of this task. The pre-existing dirty `apps/desktop/src-tauri/icons/Assets.car` was not edited or staged.
