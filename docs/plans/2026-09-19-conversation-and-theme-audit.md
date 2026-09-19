# Conversation and four-layer UI audit

Status: audit complete for the source scope below; recommendations await maintainer
discussion. This is not implementation approval or full visual acceptance.

## Scope and evidence

Inspected the current public desktop Views, shared UI theme and component sources,
history rendering/capture, and policy/test wiring. Three independent source reviews
covered DeepSeek, Open Design, and Drawloom theme compliance. No reference repository
was modified, fetched, or executed.

- DeepSeek Harness: `c291e7961a515f6d7af9304e7fd1d257929aef26`.
- Open Design: `933dc96038a4ee7a30c56d479f3497ad2716cbb3`.
- Drawloom: base `f9a60abd5bc1fc05cb138a4029c954810dc89f03` plus the existing
  uncommitted UI adoption and immediate conversation fixes.

Fresh browser inspection covered a populated conversation, docked workbench,
long resource names, expanded/collapsed structured output, first-turn navigation
and retained history warnings. Screenshots containing private work remain outside
this public repository. Reference behavior is source-inspected, not live-tested.
The public source inventory covers 34 desktop Svelte files; it is not a rendered
acceptance matrix for every screen/state. Private workbench Views and the independently
themed publishing journal are not covered by the all-public-view inventory.

## Verdict

Adopting controls has not established a consistent conversation composition.
There are two separate gaps: preserving enough presentation meaning to render a
turn coherently, and making the four theme layers authoritative across consumers.
Another framework or wholesale reference clone would not resolve either gap.

## Findings

### F1 — History loses the distinction between assistant prose and tool output

[`HistoryEntry`](../../packages/observability/conversation-history/src/index.ts)
stores user/assistant text, assets, resources and coarse lifecycle state.
[`resource-content.ts`](../../apps/desktop/host/resource-content.ts) saves returned
tool text as assistant text. The View therefore cannot reliably distinguish an
answer from a structured tool result by provenance. The new JSON-only disclosure
is a presentation fallback, not a durable classification solution.

DeepSeek uses typed render nodes and a common assembly path for live and historical
events. Open Design derives ordered prose/execution/delivery blocks. First assess
what Drawloom can project from existing records; propose an additive contract only
for information genuinely absent. Do not infer tool provenance or finality from
JSON shape, prose, or filenames, or invent facts for legacy history.

### F2 — There is no authoritative turn-level process/answer composition

[`Conversation.svelte`](../../apps/desktop/src/lib/Conversation.svelte) renders each
assistant entry independently. [`groupToolActivity`](../../apps/desktop/src/lib/tool-outcome.ts)
anchors results to the last matching message for an operation; live approvals and
signals are appended separately. This does not provide a consistent chronology
or a single owner for process, answer, delivery and operation errors.

DeepSeek folds a complete historical process window independently of its answer.
Open Design interleaves execution sections and answer content in event order.
Borrow that hierarchy, not their runtime/session machinery or product-specific
event grammar. Preserve explicit approvals, failures and uncertainty outside any
disclosure that could hide a required action.

### F3 — Generic output rendering leaves useful reference patterns unused

[`ToolActivity`](../../apps/desktop/src/lib/ToolActivity.svelte) reveals a serialized
result rather than a contextual input/output view. [`FileViewer`](../../apps/desktop/src/lib/FileViewer.svelte)
uses native media/PDF and sandboxed text frames; JSON has no dedicated file branch.
[`ArtifactViewer`](../../apps/desktop/src/lib/ArtifactViewer.svelte) renders text as
plain text. Conversation Markdown and file/document presentation therefore differ.

DeepSeek has tool-specific read, diff, terminal, image, search and question cards.
Open Design separates delivered material from files merely read. Prioritize actual
Drawloom consumers: structured output, text/Markdown, file delivery and changes.
Keep generic diagnostics as a bounded fallback. Do not introduce executable
provider-supplied renderers or relax MCP Apps/file-access boundaries.

### F4 — The four layers exist, but their documented scope is narrower than requested

[`DESIGN.md`](../../DESIGN.md#four-layer-theme-contract) and accepted
[ADR 0012](../adr/0012-shared-ui-components-and-guidance.md) permit one-off layout
measurements. Therefore not every literal is an existing violation. The new stricter
spacing policy needs an explicit refinement, not a claim that the old contract
already prohibited all such values.

[`primitives.css`](../../packages/ui/ui/src/theme/primitives.css) centralizes 20
hex colour definitions. [`semantic.css`](../../packages/ui/ui/src/theme/semantic.css)
correctly maps purpose and system appearance. OKLCH conversion belongs in primitives,
with approved appearance and contrast preserved. Imported media and syntax-highlighter
content palettes need explicit treatment rather than indiscriminate replacement.

### F5 — Competing compositions create local styling fixes

- Conversation supplies bubble width, padding and colour overrides directly to
  ChatMessage, alongside a shared Bubble implementation with overlapping geometry.
  Choose one composition; do not maintain both as competing defaults.
- Shared `settings-group/surface/row/stack` styles coexist with desktop-local
  `settings-section` and `workbench-setting-*` styles. PrimaryView mixes them.
- KnowledgeView and LocalKnowledgeSetupView repeat facts-list presentation.
- App CSS contains roughly 140 numeric layout declarations under the audit's
  broad layout-property scan. This is an inventory, not 140 proven defects.
  Recurring gaps/gutters/header dimensions need consolidation; aspect ratios,
  functional thresholds and genuine special geometry need classified exceptions.

The shared theme exposes gutter and section spacing but not a complete documented
composition rhythm. Merely replacing `28px` with `mb-7` moves the choice; it does
not establish ownership. Prefer named roles consumed through Tailwind where the
role recurs, retaining standard primitive utilities inside shared implementations.

### F6 — Passing UI policy does not enforce the requested standard

[`ui-policy.ts`](../../scripts/ui-policy.ts) excludes the primitive palette from
checks, permits colour functions containing `var()`, and exempts shared components
from arbitrary typography checks. It does not enforce spacing/composition consistency.
Derived colours in Bubble/Button can therefore live outside the semantic map.
Desktop `text-sm/xs` are mapped aliases; `text-base` still uses Tailwind's default.
Decide sanctioned aliases and semantic derived states explicitly.

The current guard passed across 798 maintained sources. That result cannot prove
OKLCH primitives, composition consistency, responsive fit, or visual equivalence.

### F7 — Browser acceptance does not protect the whole conversation

The canonical gate does not invoke the maintained browser scripts. Structural
tests often assert class/import presence, which cannot catch intrinsic-width overflow,
adjacent warning collisions or mixed historical rendering. Some tests preserve
legacy settings classes and will need behavioral replacements during consolidation.

Borrow reference geometry tests: docked/undocked conversation, historical/live parity,
late media growth, load-earlier anchors, explicit navigation, structured output,
long paths, warnings and pending approvals. Keep real scrollport checks—not merely
document width—and public synthetic fixtures independent of a private installation.

## Public View inventory disposition

| Surface | Main audit consequence |
| --- | --- |
| Conversation, composer, approvals, tools, resources | One turn composition; independent authority; responsive content containment |
| Details and file viewers | Consistent typed output presentation and document actions |
| Settings and plugin settings host | One shared grouped-row composition; private iframe content verified separately |
| Knowledge and local setup | Shared facts/status/form roles without merging subsystem ownership |
| Activity and project summaries | Reuse status/detail roles while preserving distinct execution states |
| Projects, workbench entry, archives and discovery | Apply shared collection, empty-state and spacing roles |
| Sidebar, rail and pickers | Preserve accessible controls and reading intent; classify special geometry |

## What to keep

Keep the current component libraries, native media controls, bounded history pager,
source-bound file access, original messages, approved workbench viewer and four-layer
structure. Keep denied, cancelled, failed and uncertain outcomes distinct. Open
Design's approval-disabled Codex integration and missing-result completion fallback
are not patterns to adopt. Neither reference justifies new virtualization without
measured need, a second agent runtime, or a broad plugin UI contract.

## Discussion before implementation

1. Agree the presentation vocabulary and ownership: turn, process, answer, delivery,
   status and diagnostics. Identify actual historical information gaps.
2. Refine the four-layer policy: OKLCH palette, semantic type/spacing roles, permitted
   primitive utilities and narrow geometry/content exceptions.
3. Select one shared composition per purpose, including imported-component adaptations.
4. Establish an executable public browser matrix before migrating the remaining Views.
5. Implement conversation first as the demanding consumer, then other public Views and
   separately built private consumers. Preserve appearance and data; no new install.

This sequence is a discussion proposal, not an approved implementation plan.

## Immediate-fix verification, separate from the audit

- Reproduced a 450px conversation scrollport with 859px scroll width, traced to a
  resource card sized by an unbroken filename. After containment fix: 450px/450px,
  including expanded JSON.
- Verified a 28px warning/message gap and formatted JSON disclosure in the running
  installation. These local fixes are candidates for replacement by shared composition.
- Targeted presentation/layout tests: 19 passed. Desktop build and UI guard passed.
- Canonical gate reached Bun tests: 1461 passed, 8 skipped, 1 failed with a 5-second
  timeout in `desktop foreground tools use the startup-selected authorizer`.
  The gate did not pass; downstream Node/replacement lanes did not run in that invocation.
- No live generation, permission changes, commits or publication performed for this audit.

## Reference source anchors

At the revisions recorded above:

- [DeepSeek typed chat nodes](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/client/ui-chat/src/client/contract/chat-nodes.ts)
- [DeepSeek process folding](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx)
- [DeepSeek typed tool viewers](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/client/ui-tool/src/client/tool/components/ToolRow.tsx)
- [DeepSeek scroll contracts](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/apps/web/tests/chat-scroll-contract.e2e.ts)
- [Open Design assistant composition](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/web/src/components/AssistantMessage.tsx)
- [Open Design tool lifecycle reduction](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/web/src/runtime/tool-renderers.ts)
- [Open Design Codex approval limitations](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/agent-protocol/codex-app-server/session.ts)
