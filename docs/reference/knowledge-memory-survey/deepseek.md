# DeepSeek Harness: context without a built-in knowledge curator

## Evidence boundary

Inspected 11 September 2026 at `c291e7961a515f6d7af9304e7fd1d257929aef26`, after a clean fast-forward from the earlier survey's `b2e3b2a`. This is a targeted source inspection, not a fresh execution of the application or upstream tests. The [earlier broad inventory](../harness-workbench-survey/deepseek.md) describes its own older revision; do not silently reinterpret those claims as reverified here. Root [licence](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/LICENSE) is MIT; external MCP servers have their own dependencies and terms.

DeepSeek matters because it shows where a memory provider can attach to a harness that already owns session history and context management. It is not evidence that Drawloom should implement another agent loop.

## Lifecycle

1. **Instructions enter an execution deliberately.** The agent-instructions plugin resolves workspace instructions, prepares a baseline and tracks changed instruction versions. Its pre-step hook composes an additional context message after the admitted direct messages. A rejected/no-step turn keeps context pending rather than emitting an independent model request. Successful observed file-tool operations contribute changed-path information. This is not an omniscient watcher of every external writer. [Implementation](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/agent-instructions/src/index.ts#L84), [admission and result hooks](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/agent-instructions/src/index.ts#L316).

2. **Cross-session recall is an exact snapshot, not a learned fact.** `SessionReferenceResolver.prepare(agent, content, references, signal?)` reads each referenced session's surface and builds a bounded preview. The record retains source session, captured format, captured-through sequence and omission counts. Truncated material can be retained as a separately retrievable spill. The injected text explicitly treats other sessions as untrusted, read-only background. [Preparation](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/session-reference/src/index.ts#L290), [trust framing](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/session-reference/src/index.ts#L57).

3. **Context budgeting is a separate operation.** The reference budget may use an explicit byte ceiling or derive one from the resolved model's context capacity. The conversion is a sizing heuristic, not exact token measurement. A result can therefore be omitted from the initial prompt while remaining available for later reading. Source storage, selection and prompt inclusion are not interchangeable. [Budget resolution](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/session-reference/src/index.ts#L359).

4. **Compaction operates on the native session surface.** The basic engine runs between steps under token pressure and responds to context-window errors. It can prune or summarise history. Overflow retry depends on observable durable surface progress and a bounded retry policy, not simply on attempting a summary. A pressure-compaction failure can warn and continue; cancellation prevents retry. These are execution-continuity mechanics, not an autonomous evidence-curation service. [Engine hooks](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/compaction/compaction-basic/src/index.ts#L148).

5. **Long-term memory can be external.** The repository supplies an explicitly opt-in MCP example for the reference memory server, with a local JSONL location. It requires the executable to be installed; loading the configuration does not install it. The ordinary tool boundary handles communication with that server. The example proves a composition path, not that the server is enabled by default or that it performs Nightloom-style consolidation. [Example configuration](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml#L1).

## Concrete interaction points

| Boundary | Existing shape | What the caller must still decide |
| --- | --- | --- |
| Referenced conversation | `prepare(agent, content, references, signal?)` | Which sessions to reference and under whose authority. |
| Workspace instructions | Pre-step context composition and tool-result notifications | Which instruction files are authoritative; unrelated writers are not automatically covered. |
| Context pressure | `compactIfNeeded(agent, trigger, signal)` | Model route/capacity and compaction policy. |
| External memory | Ordinary configured MCP tools | Whether to write/search; server schema, persistence and curation policy. |

The shared quality is explicit context admission. Nothing in these inspected seams requires the memory implementation to own the model transcript. Conversely, exposing a memory MCP server alone does not establish automatic recall before every turn.

## Durability, freshness and authority

A session snapshot's captured-through sequence says which history was read. It says nothing about whether a claim learned from it remains correct. Likewise, an instruction revision indicates changed input bytes, not increased confidence.

The reference path checks cancellation before publishing prepared context, including after asynchronous storage. That is a useful general pattern: an obsolete retrieval must not leak into the next task. Stored spills and bounded previews also separate efficient first access from complete access.

Do not confuse the default composition's in-memory session database option with long-term evidence storage. The inspected memory example delegates persistence to its own server. No domain confidence calculation, source-independence test, contradiction-maintenance graph or external-event reassessment waterline was established in these harness paths.

## Test evidence read

The [real Loader composition test](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/context/session-reference/tests/loader-composition.spec.ts#L35) constructs a target session, admits a bounded reference, checks that earlier text is omitted from the preview, and expects a full immutable spill with omission metadata. This is meaningful intended coverage of the exact-read contract. The test was read, not run in this survey.

## Lessons for Drawloom

**Strong reference:** bounded context results, source-position metadata, retrieval cancellation and optional memory integration through existing tools. Keep provider transcript/compaction ownership intact.

**Not demonstrated:** that a generic MCP memory example supplies automatic knowledge maintenance or enterprise access controls. Do not infer those from the presence of a package.

**Design implication for discussion:** a knowledge consumer can receive a bounded, cited result while the provider retains the complete source. The context compiler need not inherit consolidation machinery or storage formats.

## Architecture map sources

[Open the source-linked map](deepseek.html). Nodes: workspace instructions; referenced sessions; context admission; native agent request; session surface; compaction; optional external memory. Connections distinguish pre-step preparation, durable history and the optional MCP path. These logical groups are not separate deployed services.
