# Task 2 — W6 presentation and rendered lifecycle report

## Structural slice (committed)

- Commit: `1def4f7` (`refactor(desktop): project narrow conversation and composer view slices`, DCO signed-off).
- Route-owned readonly projections/actions: `apps/desktop/src/lib/conversation-view.ts`, `composer-view.ts`; consumers: `Conversation.svelte`, `Composer.svelte`, `ComposerResources.svelte`, `DiscoveryPicker.svelte`, `routes/+page.svelte`.
- AST UI policy and negative fixtures: `scripts/ui-policy.ts`, `scripts/ui-policy.test.ts`. Concrete `DesktopViewModel` imports in Svelte Views are rejected; ordinary JSON/date/number parsing remains permitted.
- Projection tests: `apps/desktop/src/lib/composer-view.test.ts` (picker order and draft preservation, selected-workbench resource isolation).

Red evidence: `pnpm exec vitest run scripts/ui-policy.test.ts -t 'concrete DesktopViewModel props'` failed 1/1 before the AST rule (`expected [] to include 'view-responsibility'`).

Green evidence after the structural commit:

- `pnpm --filter @drawloom/desktop check`: 0 errors, 0 warnings.
- `pnpm --filter @drawloom/desktop build`: passed.
- `pnpm run check:ui-policy`: OK, 920 maintained source files.
- `pnpm exec vitest run scripts/ui-policy.test.ts`: 68 passed.
- `pnpm exec vitest run apps/desktop/src/lib/composer-view.test.ts apps/desktop/src/lib/view-model.test.ts apps/desktop/src/lib/plugin-view-session.test.ts`: 90 passed.
- `pnpm run test:ui`: existing real-browser acceptance 1 passed.

## Structural review follow-up

- Commit: `94bd4db` (`test(desktop): close presentation boundary coverage gaps`, DCO signed-off).
- Namespace-qualified `desktop.DesktopViewModel` is now rejected as well as direct and aliased named imports.
- `conversation-view.test.ts` covers history/anchor nodes and turns, selected workbench, activity, elicitation and project source mapping. It also switches the backing conversation before calling projected model/reviewer/input actions and asserts all three dispatch to the current conversation.
- Green: the five focused policy/projection/session/model files passed 84 tests; desktop check reported 0 errors/warnings; UI policy checked 922 files.

## Rendered lifecycle slice

- Commit: `6ad0453` (`fix(desktop): scope hosted view and model lifecycles`, DCO signed-off).
- Red rendered evidence: the installed-package browser case observed two `close` requests for one mount after a conversation switch (`expected 1, received 2`). `PluginViewFrame`'s outro and on-mount cleanup both called release. `createPluginViewSession.release()` is now idempotent while retaining delayed-open cleanup.
- Red model evidence: the former unit test settled the old request before starting the next. The replacement genuinely overlaps two refreshes and settles the newer response first; an older response can no longer replace it. The browser case initially proved the production selector ignored overlapping refreshes. The lifecycle now starts a newer request and uses its epoch; the composer keys selector ownership to conversation ID.

Rendered real-browser cases now exercised with public synthetic fixtures:

1. A real installed public package mounts `PluginViewFrame`, receives one host mount and performs one iframe navigation after setup without showing the durable navigation warning.
2. Switching conversations removes the old DOM frame, closes its exact mount once, and opens/navigates the new conversation once.
3. A second iframe load (after the one allowed navigation) disconnects and hides the frame and renders the durable warning.
4. A held mount response followed by another conversation selection cannot navigate the destroyed frame; its eventual mount closes exactly once, and only the current frame navigates.
5. Session unit coverage confirms abort propagation to interaction/tool calls and a late-resolving open still receives one keepalive close.
6. `CodexModelSelector` issues two genuinely overlapping responses across close/reopen, displays only the newer result after the old result arrives, then remounts on conversation switch and dispatches selection to that current conversation.

Final green evidence:

- `pnpm --filter @drawloom/desktop check`: 0 errors, 0 warnings.
- `pnpm --filter @drawloom/desktop build`: passed (only existing bundle-size and third-party `use client` warnings).
- `pnpm run check:ui-policy`: OK, 922 maintained source files.
- Focused policy/projection/model/session suite: 84 passed.
- `pnpm run test:ui`: 3 real-browser tests passed (existing desktop acceptance plus installed hosted-view lifecycle and rendered Codex selector stale-response lifecycle).

Explicit gaps: the root canonical gate remains owned by main as requested. No Tauri/Rust/signing/native-resource source was changed. The pre-existing generated `apps/desktop/src-tauri/icons/Assets.car` modification remains unstaged and uncommitted. The installed test package and data are temporary, public synthetic fixtures removed by test cleanup; no provider calls are made.
