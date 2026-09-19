# Shared AI component adoption

Status: implementation and automated verification complete; live workbench
activation awaits resolution of an existing native approval. Uncommitted.

## Approved outcome

Use Svelte Prompt Kit predominantly, with Svelte AI Elements for confirmation,
tool activity and evidence. Components live in `@drawloom/ui`; desktop and private
workbenches consume public exports. Preserve the approved episode document.

## Interaction brief

Approval uses guarded commitment: provider-issued choices remain authoritative;
dismissal sends no decision, Stop stays available and failed presentation can be
reopened. Pending feedback belongs to the exact action. Keyboard focus survives
dismissal/reopening. Long names and details must fit narrow panels.

Composer uses assisted input and immediate acknowledgement: preserve draft,
attachments, mention selection, IME, queueing and steering. Suggestions populate
the draft, never send automatically. Loading must not disable unrelated editing.

Conversation uses contextual navigation: initial history opens at the tail;
deliberate upward scrolling, search anchors and pagination retain their position.
Reduced motion uses instant movement. Message formatting never authorizes file
access or automatically fetches embedded remote media.

Tool activity and progress use loading/progress and contextual disclosure: retain
denied, cancelled, failed and uncertain outcomes, with details secondary. Evidence
links remain independently authorized. No reconstructed reasoning or fake progress.

## Tasks and verification

1. Import selected registry components with source provenance and notices.
2. Adopt confirmation and tool presentation, then composer.
3. Adopt message, Markdown, status, scrolling and suggestions.
4. Integrate evidence/progress through shared exports in the private workbench.
5. Run component and behavior tests, browser checks, package checks, dependency
   and licence gates, and final canonical checks. Do not approve pending work.

## Execution record

- Existing dirty work preserved on `feature/replaceable-capabilities`.
- Registry CLI runs in a temporary admission directory to avoid overwriting
  existing shared primitives. This is not a second application installation.
- Ruling: install the approved selection, not duplicate overlapping full catalogues;
  the user's later consolidation instruction governs. Unused components are not
  activated merely because a registry offers them.
- Public composition adoption is implemented: Prompt Kit input/message/Markdown,
  status, suggestions and scrolling; AI Elements confirmation and tool rows.
  Known installed tool aliases resolve to admitted display titles. Native choice
  identifiers and raw action details are retained.
- Private Foundations consumes shared Sources, Steps and SystemMessage without
  replacing its approved document/accordion layout.
- Final source review found a Markdown foreground override and unused tooltip
  wrappers that nest buttons. The contrast regression was reproduced in the
  browser, then corrected with inherited theme colours. The unused wrappers
  were removed from the selected exports rather than exposing a broken API.
- Ruling: retain existing numbered in-document evidence navigation instead of
  importing a hover-only citation control. Sources supplies the evidence rows;
  this preserves the approved click/focus behaviour. A future hover preview
  remains optional, not an alternative evidence store.
- Ruling: do not retire the live project runtime while its graphics approval is
  pending. Public assets can be refreshed independently; activating the rebuilt
  embedded workbench view waits for that request to be resolved. No approval,
  generation, permission change or new installation is performed by this work.

## Verification so far

- Shared UI, approval and tool outcome tests: 21 passing, zero failures.
- Shared Svelte check: zero errors and warnings; desktop build succeeds.
- Browser suites against the existing host, with all test commands intercepted:
  light/dark, 390 px, 200% zoom, reduced motion, initial tail, reading position,
  mention Enter, IME, multiline input, foreground contrast, approval wrapping,
  dismissal/re-presentation/focus and Stop during an unresolved response pass.
  No live approval was resolved by those tests.
- Private canonical gate: 260 passing, two opt-in live tests skipped, zero
  failures. Skips are not evidence of live provider acceptance.
- Dependency licence and UI policy checks pass. DOMPurify 3.4.15 explicitly
  selects its Apache-2.0 alternative; Khroma 2.1.0's MIT licence is verified
  against the installed licence file, not inferred from missing metadata.
- Public canonical gate passed format, documentation, dependency/licence policy,
  package builds and packed exports, desktop build/check, architecture, design,
  strict types and publishing checks. Its first Bun run found two structural
  assertions tied to replaced tags/classes. After updating them, the complete
  Bun lane passed: 1,459 passing, eight explicitly skipped, zero failures. Node
  and packed replacement/application-conformance lanes then passed separately.
  This is a gate run followed by corrected-lane reruns, not a claim that the
  original `check:ci` invocation exited successfully.
- Final private packed refresh: zero Svelte errors/warnings, self-contained view
  build, 17 evidence/ViewModel/installed-resource tests passing. Built HTML and
  the staged existing-install artifact have matching SHA-256 hashes. The running
  MCP view retains its prior HTML until runtime reload; that activation remains
  intentionally pending, not counted as installed-view browser verification.
- Both final browser matrices passed following the review fixes. The existing
  native approval and operation identities were checked afterward: unchanged.
