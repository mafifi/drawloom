# ADR 0030: Compose consistent interfaces from shared roles and retained meaning

- **Status:** Proposed
- **Date:** 2026-09-19
- **Decision owners:** Drawloom maintainers

## Context

The [conversation and theme audit](../plans/2026-09-19-conversation-and-theme-audit.md)
found recurring layout fixes despite adoption of shared controls. Views still
choose competing geometry, and tool text can enter history as assistant prose.
A common component library cannot recover provenance missing from stored data.
The maintainer authorised implementation across the public desktop and private
consumers, preserving the approved appearance and existing installation.

## Decision

Make the four theme layers authoritative. Primitives own raw OKLCH colours,
scales and dimensions. Semantics map purpose and system light/dark appearance.
Shared components and compositions implement these roles through Tailwind.
Views select content and compositions rather than one-off measurements.

This proposes partially superseding ADR 0012's allowance for one-off layout
values, not its shared-control or accessibility boundaries. Runtime measurements,
content aspect ratios and behavioural thresholds remain with their explicit
owners; they are not a licence for local spacing or colour scales. Authored media
and the independently themed journal are outside this migration.

Use the adopted Prompt Kit, AI Elements and shadcn components through the public
UI package. Keep one composition per purpose, including conversation, settings,
facts, notices and viewers. Remove competing implementations rather than retaining
compatibility wrappers. Shared components own visual rhythm; ViewModels and hosts
retain operation state, commands and authority.

Extend display history only with missing provenance and correlation. A shared
ordered projection presents live and retained turns. Process detail may collapse;
answers, pending approvals, errors and uncertain outcomes remain discoverable and
honest. Never infer tool origin from JSON, filenames or prose, or execution success
from overall turn completion. This extends ADR 0014 without replacing native
provider transcripts, capture-once media or source-bound access.

Convert existing history once with a backup and trusted retained provenance. No
permanent dual schema or heuristic compatibility reader is introduced. Report
unconvertible conversations before requesting a targeted reset; project files,
scripts and recordings are independent and must survive. No new installation,
renderer protocol, provider runtime or execution permission is introduced.

## Alternatives considered

- **Shared controls plus local fixes — evaluated in the current application.**
  The audit demonstrates inconsistent rhythm and overflow despite passing policy.
- **Rename each literal as a token — rejected.** This preserves competing choices
  and does not give repeated structure an owner.
- **Clone a reference harness — considered, not implemented.** DeepSeek's typed
  nodes and Open Design's ordered execution/answer blocks inform the hierarchy;
  their runtimes and authority assumptions do not belong in Drawloom.
- **Permanent legacy rendering — rejected by the maintainer.** A one-time
  conversion is preferable before release, without silently discarding work.

## Evidence

The linked audit records exact DeepSeek and Open Design source revisions,
confirmed Drawloom gaps, browser observations and verification limits. Reference
source inspection is not executed reference acceptance. Implementation progress
and new tests are recorded [separately](../plans/2026-09-19-ui-consistency-implementation.md).
No new implementation acceptance is claimed by this proposed record.

## Consequences

New Views must reuse shared presentation roles. CI must check theme boundaries
and rendered public synthetic scenarios, including narrow panels, both themes,
scroll intent and approval states. Private consumers verify separately without
contributing private fixtures to public CI. Static policy alone cannot prove
composition quality or accessibility. Migration and rendered review cost more
than a palette substitution but remove the source of repeated local repairs.
