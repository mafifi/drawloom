# Letta and Letta Code: agent-owned context across two generations

## Snapshot and product distinction

Inspected on 2026-09-11, using public repositories only:

| Repository | Local checkout | Pinned revision | Meaning |
| --- | --- | --- | --- |
| `letta-ai/letta` | `/Users/afifim/Development/letta` | `5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a` | Current main is a documentation redirect |
| `letta-ai/letta`, archive branch | Git object fetched in the same checkout | `56ba9c25552605eec89de8ed3dc6394b625c1993` | Retired Python V1 server, inspected with `git show` |
| `letta-ai/letta-code` | `/Users/afifim/Development/letta-code` | `aa3e294d006b448e36a0be44afed440f47923aa8` | Current TypeScript harness and local runtime, package version 0.32.2 |

Both current root repositories carry Apache-2.0 licenses. The live Letta README
explicitly places active source in Letta Code and identifies the archive branch
as retired. Consequently, treating current Letta Code as merely a thin client
of the old Python server would be wrong at these revisions. Conversely,
cloud-facing APIs in the current client do not prove the hosted service's
implementation is available locally. No dependencies, database services, or
models were installed; no runtime or benchmark tests were executed.
[Current repository status][redirect]; [Letta license][old-license];
[Code license][code-license]; [Code package][package].

MemGPT's core/recall/archival terminology and sleep-time research are useful
historical vocabulary. This report distinguishes those concepts from the
specific implementations below. The current README calls sleep-time compute
"dreaming" and points to the research; the actual source also uses reflection.
These names should not collapse into an unqualified single lifecycle.
[Research/product terminology][research].

## Retired Python server: core, recall, and archival memory

**Core memory** is the agent's in-context collection of labeled `Block`
objects. The `Memory` schema says this explicitly and also supports special
attached-file blocks. For Git-enabled agents, its renderable block selection
includes only `system/` labels. Core is therefore a context-placement category,
not a confidence level or a synonym for all durable storage.
[Memory schema and render filtering][old-memory].

**Recall** is prior conversation material queried through message management.
The real executor's `conversation_search(agent_state, actor, query=None,
roles=None, limit=None, start_date=None, end_date=None)` parses temporal filters
and invokes `MessageManager.search_messages_async` with the current agent ID
and actor. It excludes tool messages and assistant conversation-search calls
to avoid recursively retrieving nested search results. This is evidence
retrieval from recorded interaction, distinct from extracting new factual
records. **Archival memory** is separate passage storage accessed on demand;
search delegates to `AgentManager.search_agent_archival_memory_async`, while
insertion calls `PassageManager.insert_passage` with content, actor, and tags.
[Actual executor dispatch and recall][old-executor];
[archival implementation][old-archival].

A source-reading trap matters here. The public tool declarations in
`functions/function_sets/base.py` contain `NotImplementedError` bodies for
archival operations. The implementation is in `CoreToolExecutor`, whose
function-name map dispatches to actual methods. A function signature by itself
would not prove an operational storage path. For core edits, the executor
checks a block's `read_only` flag, performs append or replacement, and calls
`update_memory_if_changed_async`. The replacement path checks that the old text
exists. These are concrete editing safeguards; they do not establish the
truth of replacement content. [Dispatch][old-executor];
[declarations and stubs][old-declarations]; [core edit operations][old-archival].

The context path is explicit: agent memory is rendered with `memory.compile`,
`rebuild_system_prompt_async` creates or updates the compiled system-message
representation, and the agent loop builds provider request data from its
in-context messages. Search results arrive as tool results and must be consumed
or incorporated by that loop; archival storage does not itself become an
always-present prompt. The source also distinguishes input messages pending
step persistence from messages already in the context checkpoint. A stateful
agent can reload durable state, but this alone is not proof of exactly-once
tool effects or completed asynchronous learning after a process crash.
[System prompt rebuilding][old-rebuild]; [request construction][old-request].

The archive's `SleeptimeMultiAgentV4.step(input_messages, max_steps=...,
run_id=..., conversation_id=..., ...)` first runs the foreground agent, then
calls `run_sleeptime_agents`. The streaming path does this in `finally`.
Frequency is governed by a persisted group turn counter. When due, the manager
obtains and advances the last-processed-message marker, creates a Run, and
starts a background participant via `safe_create_task`. That participant
constructs a transcript from prior and current messages and prompts another
agent to maintain relevant memory blocks. This is a separate model run over
conversation evidence, not a deterministic summarizer and not proof that every
agent has sleep-time enabled. [Foreground/background wiring][old-sleep].

An important recovery distinction is visible: the group marker is advanced
before issuing the background work, rather than only after its successful
completion. The task has a persisted Run status, but the inspected scheduling
path uses a process background task. This does not establish automatic durable
replay of an interrupted sleep-time update. A complete deployment recovery
claim would need additional evidence beyond this class. Actor and agent IDs
travel through manager calls, and read-only blocks are enforced at the tool
boundary; this survey has not audited every API's entitlement policy.
[Scheduling and checkpoint order][old-sleep].

The archive contains a concrete PostgreSQL/pgvector Docker composition and
provider environment settings. It is historical deployment evidence, not the
prerequisite list for current Letta Code. No archived service was started.
The integration test inspected here starts or connects to a Letta server and
uses a real client fixture; its presence is not a passing test result.
[Archive composition][old-compose]; [read integration-test fixture][old-test].

## Current Letta Code: capture to reflected memory

Current Code stores an agent's context in a Git-backed memory filesystem
(MemFS). `getScopedMemoryFilesystemRoot` distinguishes local-backend storage
from the ordinary agent directory. Conversation evidence and maintained memory
remain separate: `appendTranscriptDeltaJsonl(agentId, conversationId, lines)`
converts turn lines to transcript entries, appends JSONL under an
agent/conversation-specific path, updates completed-step state, and writes
state under a lock. The headless turn loop calls it before evaluating
post-turn reflection. This is an actual caller chain, not only a helper export.
[Memory location resolution][filesystem]; [transcript capture][transcript];
[headless caller][headless].

`maybeLaunchPostTurnReflection({ agentId, conversationId, memfsEnabled,
reflectionSettings, reminderState, contextTracker, launch, ... })` evaluates
the configured trigger. It supports off, step-count, and compaction-event
modes, and returns without launching if no agent or MemFS is enabled. A
completed turn can therefore be captured without producing a memory edit.
Compaction state also has a context-maintenance role independent of reflection.
[Trigger implementation][trigger].

`prepareReflectionMemoryWorktreeLaunch` resolves the agent's memory directory
and creates an isolated Git worktree for the reflection. The launcher supplies
the memory and transcript payload to a reflection subagent. The v2 reflection
prompt directs that agent to inspect existing memory, extract durable
preferences/corrections/facts, resolve contradictions in the existing source,
and maintain a skill only for a reusable multi-step workflow. It requests
precise edits and commits. This is concrete extraction and maintenance policy
encoded in a prompt; it is not a schema that mechanically proves relevance or
accuracy. [Worktree launch][launch]; [v2 reflection policy][reflection-prompt].

There are two current memory formats, and backend selection matters.
`detectMemoryFormat(memoryDir, localMemfs)` selects v2 only when a root
`MEMORY.md` exists **and localMemfs is false**. V1 uses `system/` Markdown for
core memory. V2 uses root Markdown files as core, a root `MEMORY.md` index,
and indexed child directories for deferred memory; skills are excluded from
ordinary memory projection. The v2 prompt describes this arrangement, while
the local compiler still uses the v1 `system/` placement. It would therefore
overstate current local support to present the v2 prompt as the universal
runtime contract. [Format gate and path predicates][format];
[local projection][compile]; [v2 prompt][reflection-prompt].

## Integration, restart markers, and actual prompt input

Reflection completion is not automatically memory integration. The finalizer
has separate outcomes for merged, no changes, dirty parent, merge conflict,
uncommitted work, and failure. Only merged/no-changes outcomes consume the
transcript; only merged changes request context recompilation. The launcher
combines subagent success with that integration outcome before marking
completion. In `explicit` merge mode, the code can run a separate integration
agent with configured instructions; the word **explicit does not mean human
approval**. The integration prompt specifically delegates review and merge to
that agent. [Outcome predicates][worktree]; [launcher finalization][finalize];
[integration-agent instructions][integration].

`finalizeAutoReflectionPayload(agentId, conversationId, payloadPath,
endSnapshotLine, success)` advances `reflected_through_message_id` and successful
step counters only when `success` is true, under the state lock. Multi-transcript
finalization advances only successful unreflected slices, leaving replay slices
alone. This creates a much clearer retry boundary than the archived sleep-time
class's advance-before-background-run ordering. It is still not a demonstrated
cross-process exactly-once guarantee: this survey inspected the mechanism but
did not kill and restart the runtime at every write/merge boundary.
[Successful-consumption checkpoint][checkpoint].

The local model-context path is especially concrete. The compiler reads the
memory repository's **committed HEAD** with `git ls-tree` and `git show`, rather
than indiscriminately reading the working tree. It renders `system/persona`
and other `system/` file contents, plus external-file projections. It records
the commit revision, raw system-prompt hash, and compilation timestamp, then
injects the result at `{CORE_MEMORY}` (adding the placeholder if necessary).
`LocalBackend.resolveSystemPromptForTurn` obtains that compiled value and adds
available skill descriptions. The cache compares prompt hash and MemFS
revision; for supported providers it can deliver a mid-conversation memory
update instead of replacing the original system prompt.
[Committed-file compiler][compile]; [per-turn selection and revision check][local].

The final caller is not hypothetical: inherited `HeadlessBackend` execution
calls `resolveSystemPromptForTurn` and passes the result to `executor.execute`
alongside agent, conversation history, and UI messages. `buildProviderTurnInput`
preserves that system prompt. The local executor factory selects a
`ProviderTurnExecutor` using `PiStreamAdapter` unless a test executor or
deterministic mode was explicitly supplied. The path's files live partly under
`backend/dev`, but the local composition imports them. Directory naming alone
is not evidence that the path is unused. Deferred file contents and skill
bodies are not all automatically inserted; the model must retrieve relevant
content with tools after seeing projections/descriptions.
[Turn caller][turn]; [provider input][provider]; [local composition][factory];
[projection][compile].

This is materially different from Mem0's retrieval library: Letta Code owns the
agent loop and has an explicit committed-memory-to-system-context path. Its
memory files can contain behavioral instructions as well as factual notes.
That makes the selection and write authority consequential: a changed memory
file may change future model behavior, even without changing application code.
This is an architectural inference from the compiler and editing path, not a
claim that a new Drawloom interface should copy it.

## Provenance, correction, privacy, and operating limits

Git gives inspectable revisions and diffs for maintained context; transcript
entries and successful-consumption markers identify the interaction slice
considered during reflection. The local compiler's revision links one prompt
projection to a particular committed tree. These are useful provenance facts,
but they do not assign factual confidence, guarantee a claim-to-source-span
citation for every sentence, or verify a reflection agent's interpretation.
The reflection prompt's accuracy and contradiction instructions are cooperative
model guidance. Keep those separate from the finalizer's mechanically checked
Git-state outcomes. [Compiler metadata][compile]; [capture][transcript];
[reflection policy][reflection-prompt]; [outcomes][worktree].

The prompt instructs correction at the existing source, moving material between
tiers, and deleting information the user asks to forget. Ordinary Git deletion
removes content from the current projection but retains older commits; transcript
capture and model-provider records are separate stores. Therefore a successful
file deletion or memory merge is not proof of comprehensive erasure. The same
distinction applies to the archive's core edits versus recall and archival
passages. Neither storage vocabulary should be mistaken for a single global
forget operation. [Reflection correction/deletion guidance][reflection-prompt];
[committed projection][compile]; [archive stores][old-archival].

Agent-specific paths are a scope mechanism, not an entitlement proof. Current
Code also has a separate memory-confinement launcher: it detects a supported
kernel sandbox and fails when unavailable. Its stated policy permits broad
host reads, writes to harness state and the assigned memory, and denies access
to other agents' memory. This is stronger evidence than prompt-only
instructions, but no sandbox behavior was exercised on this machine. Remote
Git authentication, configured shared repositories, host tool permissions,
and the memory scope each remain separate responsibilities.
[Confinement entrypoint][confinement]; [availability enforcement][confinement-check].

Local runtime state is filesystem based: the store persists agent and
conversation JSON, transcript JSONL, and compiled prompts. Git is required by
the inspected MemFS compiler and worktree path; the project specifies Bun for
development and publishes a CLI package. Actual model execution needs the
selected provider configuration and credentials or an available compatible
local model. Cloud storage/synchronization claims remain a different deployment
path and were not tested. Existing tests cover local-vs-API format gating and
reflection integration behavior; these are source-read tests only.
[Local persistence][store]; [package][package]; [format test][format-test];
[integration tests][worktree-test].

## Architecture-map handoff

Use nine nodes for the current Code map, keeping the archive as a separate
historical comparison rather than mixing both engines into one diagram.

| From | To | Meaning and source |
| --- | --- | --- |
| Foreground turn | Transcript JSONL/state | Append before trigger evaluation; [headless lines 4763–4775][headless] |
| Transcript JSONL/state | Reflection trigger | Completed-step/compaction selection; [post-turn-reflection lines 22–80][trigger] |
| Reflection trigger | Reflection subagent | Launch against transcript payload and isolated worktree; [launcher lines 521–558][launch] |
| Reflection subagent | Git memory worktree | Model-authored corrections/facts/skills; [reflection-v2 lines 8–120][reflection-prompt] |
| Git memory worktree | Integration finalizer | Merge outcome determines success; [launcher lines 619–630][finalize] |
| Integration finalizer | Transcript JSONL/state | Consume only successful slices; [transcript lines 1870–1925][checkpoint] |
| Integration finalizer | Committed memory repository | Only merged changes trigger recompile; [worktree lines 231–240][worktree] |
| Committed memory repository | Local context compiler | Read HEAD, project core/deferred memory; [compiler lines 60–110, 223–264][compile] |
| Local context compiler | Provider turn | Compiled system prompt plus history reaches executor; [turn lines 491–518][turn] |

[redirect]: https://github.com/letta-ai/letta/blob/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a/README.md#L1-L36
[old-license]: https://github.com/letta-ai/letta/blob/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a/LICENSE#L1-L9
[code-license]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/LICENSE#L1-L9
[package]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/package.json#L1-L10
[research]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/README.md#L109-L113
[old-memory]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/schemas/memory.py#L68-L130
[old-executor]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/services/tool_executor/core_tool_executor.py#L27-L168
[old-archival]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/services/tool_executor/core_tool_executor.py#L278-L344
[old-declarations]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/functions/function_sets/base.py#L164-L243
[old-rebuild]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/services/agent_manager.py#L1523-L1608
[old-request]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/agents/letta_agent_v3.py#L1060-L1115
[old-sleep]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/groups/sleeptime_multi_agent_v4.py#L24-L240
[old-compose]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/compose.yaml#L1-L48
[old-test]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/tests/integration_test_sleeptime_agent.py#L15-L58
[filesystem]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/memory-filesystem.ts#L44-L80
[transcript]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/reflection-transcript.ts#L911-L950
[headless]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/headless.ts#L4750-L4795
[trigger]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/post-turn-reflection.ts#L14-L80
[launch]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/reflection-launcher.ts#L521-L558
[reflection-prompt]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/subagents/builtin/reflection-v2.md#L8-L150
[format]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/memory-format.ts#L4-L49
[compile]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/local/system-prompt-compilation.ts#L60-L371
[local]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/local/local-backend.ts#L935-L1010
[worktree]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/memory-worktree.ts#L211-L240
[finalize]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/reflection-launcher.ts#L560-L673
[integration]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/reflection-integration.ts#L11-L37
[checkpoint]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/cli/helpers/reflection-transcript.ts#L1870-L1925
[turn]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/dev/fake-headless-backend.ts#L475-L529
[provider]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/dev/provider-turn-executor.ts#L128-L142
[factory]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/local/local-executor-factory.ts#L38-L66
[confinement]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/memory-confinement.ts#L13-L28
[confinement-check]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/permissions/memory-confinement-launcher.ts#L59-L95
[store]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/backend/local/local-store.ts#L3230-L3348
[format-test]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/memory-format.test.ts#L1-L22
[worktree-test]: https://github.com/letta-ai/letta-code/blob/aa3e294d006b448e36a0be44afed440f47923aa8/src/agent/memory-worktree-http.test.ts#L153-L220
