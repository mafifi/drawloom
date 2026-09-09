# ADR 0012: Share UI components and guide their correct use

- **Status:** Accepted
- **Date:** 2026-09-09
- **Decision owners:** Drawloom maintainers

## Context

The maintainer approved shadcn-svelte, a shared public UI package, reusable
stateful feedback and helpful checks. Importing isolated primitives did not
preserve the agreed layout: custom sidebar composition and nested input chrome
still drifted. Component adoption must preserve behaviour and visual intent.

## Decision

`@drawloom/ui` owns reusable Svelte controls, public exports and theme tokens.
Start with actual shadcn-svelte registry components; preserve their accessible
composition, bindings and events. Record upstream provenance and deliberate
local adjustments. Use complete Sidebar composition for responsive navigation
and InputGroup for controls sharing an input surface, rather than reconstructing
those behaviours. Add only components needed by real consumers.

Views own layout and command wiring; ViewModels own operation state. Visual
rules belong in [DESIGN.md](../../DESIGN.md). The journal remains independent.
Public and separately built private consumers use the same package exports.
The package contains no provider, clinic, recipe or private workbench types and
does not grant plugins arbitrary UI execution inside the host.

`StatefulButton` wraps the standard Button with controlled pending feedback,
a spinner by default, an accessible label and duplicate-action prevention.
Its ViewModel identifies the actual pending command. Sending a message and
saving a settings field are contrasting consumers. A sibling disabled by
another action remains an ordinary Button; eligibility is not loading.

The wrapper does not infer success from resolved promises: commands can catch
errors without succeeding. Error reporting stays with its owner. Timers,
hold-to-confirm and business approval rules are not prerequisites. Further
shared interactions need a recurring need, a small contract and focused tests.

## Checks and guidance

- The canonical gate parses maintained UI sources and rejects raw control
  reimplementations, direct primitive imports and undeclared internal paths.
  Diagnostics include a file, line and replacement advice.
- Explicit loading props on plain Button prompt StatefulButton use. Ordinary
  sibling and eligibility disables remain valid. Semantic review must identify
  non-instant command handlers; naming heuristics cannot prove their behaviour.
- Semantic layout, links, native media and sandboxed document viewers remain
  valid HTML. This is not a blanket HTML ban.
- A repository-scoped Codex PostToolUse hook reuses the checker after edits and
  returns concise model-visible guidance. Clean checks are quiet. The hook is
  advisory; CI remains authoritative for edit paths the hook does not cover.
- New or changed hooks require normal user trust review through `/hooks`.
  Committing a definition does not enable it. No global settings, permissions
  or trust bypasses are introduced.

The [package README](../../packages/ui/ui/README.md) owns exact consumer props,
exceptions and checker limits. The reference monorepo informed the distinction
between active-action feedback and sibling disabling; public tests do not
require private sources or services.

## Alternatives and consequences

App-local wrappers invite drift; adopting an entire private UI stack adds
unneeded behaviour and coupling. A universal component framework or a ban on
all HTML would not address the observed problems efficiently. Lint alone misses
intent; prompts alone cannot enforce a boundary. Small checks plus contextual
guidance give useful feedback without claiming complete visual verification.

Verification includes public-export component tests, actionable checker/hook
tests, package builds and browser checks of alignment, composer shape,
responsive navigation, focus, system themes and real pending feedback.
Passing type checks alone is not visual acceptance.

## References

- [shadcn-svelte Sidebar](https://www.shadcn-svelte.com/docs/components/sidebar)
- [shadcn-svelte Input Group](https://www.shadcn-svelte.com/docs/components/input-group)
- [Codex hooks and trust](https://learn.chatgpt.com/docs/hooks)

[Rosalind's MCP Apps UI and first-party host bridge](../reference/mcp-apps-host-evidence.md) are separate integration
evidence, not a decision to replace this shell or depend on undocumented APIs.
