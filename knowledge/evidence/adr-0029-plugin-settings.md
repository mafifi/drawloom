---
type: evidence
id: adr-0029-plugin-settings
title: Installation-scoped plugin and workbench Settings
status: active
created: 2026-09-17
updated: 2026-09-17
---

# Installation-scoped plugin and workbench Settings

This record supports [Accepted ADR 0029](../../docs/adr/0029-plugin-and-workbench-settings.md).
It separates reference inspection, product tests and installed-consumer verification.
Public implementation has passed targeted review, installed-browser checks and
the canonical repository gate. Separate private consumer verification also passed;
business evidence remains in that repository.

## Reference inspection

The [integration reference](../../docs/reference/plugin-settings.md) identifies
the inspected Rosalind distribution and DeepSeek revision, the affected source
paths and the limits of that inspection. Neither upstream implementation was
executed or copied. These references support the placement and ownership decision;
they are not a substitute for Drawloom's isolation and lifecycle tests.

## Implementation checks

The public fixture uses a generic preferences page with no private repository,
credentials, model or project. Required checks cover installation admission,
exact app-only tool lists, owner and mount identity, independent page/connection
lifetimes, failure recovery and the actual HTTP and desktop paths.

On 17 September 2026, `bun run check:docs` passed with all four new
documents included: 244 files, 57 retained records and 30 decision records
(including the template). Because the checker reads Git's tracked-file list,
this used a disposable alternate index containing the new files. The checkout's
real index was unchanged and the temporary index was removed. This result
verifies structure and links, not runtime behaviour.

Executed public checks on the same date:

- `bun test` across Settings, MCP Apps, project OAuth, package schemas, package
  runtime and desktop ViewModel tests: 103 passed, 512 assertions at that point.
- After the final revocation fixes, the Settings suite passed nine tests and
  67 assertions, independently repeated by the reviewer.
- `bun run --cwd apps/desktop check`: zero errors and warnings.
- `bun run --cwd apps/desktop build`: passed; the existing large-chunk warning
  remains a build advisory, not a claim of bundle optimisation.
- `plugin-settings-routes.test.ts`, with the browser runner enabled: one test,
  nine assertions passed against the real authenticated HTTP host. The generic
  installed package opens without a project, working backend or generation runtime.
- Final `bun run check:ci`: passed. The Bun suite reported 1,441 passing tests,
  eight explicit skips, no failures and 7,042 assertions. Node conformance and packed replacement
  consumers also passed. Optional skipped lanes are not counted as acceptance.

The first full-gate attempt inherited the disposable `GIT_INDEX_FILE` used to
include new files in tracked-file guards. That environment also reached tests
creating temporary Git repositories, causing 13 fixture failures. The real index
was unchanged. The canonical gate was rerun without that environment and passed;
new-file guards had already passed separately. This was a verification setup
correction, not a product-code fix.

Installed-consumer closeout also exposed two generic integration defects. Trusted
managed JSON reports are now retained and served as downloads without broadening
browser imports or native image input. Orchestration owners retain their bundle
compilation context, preventing an app launch-directory change from changing
otherwise identical executable fingerprints. Legacy adoption requires the saved
fingerprint; genuine-code update guards remain. The real Temporal lane passed
seven tests with no skips, including adoption and unchanged-record rejection.
These fixes received targeted regression tests and independent review before the
final canonical gate above. Private results remain separately documented.

The browser runner exercises keyboard opening, saving, closing/reopening, light
and dark themes, 390px width, reduced-motion mode and visible controls with 200%
CSS zoom. This is not native browser zoom or a full screen-reader audit. Its
fixture root and browser are removed after the run. Screenshots are disposable
review aids, not release imagery.

## Review findings and corrections

Independent review found three gaps: OAuth disconnection missed Settings sessions;
explicit reopening retained a dead client; and the production package close
operation discarded cleanup errors. Each received a failing behaviour test before
its fix. Both OAuth disconnect and client replacement now invalidate old mounts.
Explicit reopening can replace a failed connection without replaying tool calls.
Package shutdown closes all connections and retains a shared success/failure result.

A follow-up review reproduced revocation being rejected at the normal request
limit. Trusted invalidation now bypasses that limit and expires mounts immediately
before draining admitted calls. A related startup race was also reproduced: an
opening page could finish after invalidation. An owner generation now rejects that
late mount. Both regressions pass; scoped re-review found no remaining issues in
these changes. This is targeted review, not a claim of exhaustive security proof.

## Scope limits

Private workbench setup and business-specific tests remain in their private
repository. Public success must not be described as proof of a private model
download, expressive narration, voice consent or clinical approval. No model
generation or paid service is needed for the public Settings checks.

Separately, private installed-consumer checks exercised all declared owner pages
through the actual desktop host without a project, including preference
save/reopen and explicitly configured runtime prerequisites. Real retained-model
setup passed in disposable environments; it did not repeat full-size remote model
downloads or generate content. Scoped private review findings were fixed and
rechecked there. Neither browser result claims packaged Tauri or screen-reader
acceptance.

The maintainer accepted ADR 0029 and requested separate public/private checkpoint
commits on 17 September 2026. Acceptance covers the Settings boundary, not creative
approval, new model generation or publication.
