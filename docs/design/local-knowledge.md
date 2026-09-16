# Local knowledge and memory

Drawloom records observations and distils them into learnings, keeping evidence
that supports or disputes them. Nightloom is the background process that
coordinates this curation. Use this guide to understand how records arrive,
how they are assessed and how an agent can find them again.

[ADR 0024](../adr/0024-local-knowledge-memory-and-retrieval.md) describes the
local implementation. [ADR 0026](../adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
replaces its original embedding runtime. The
[evidence record](../../knowledge/evidence/adr-0024-local-knowledge.md) separates
tested behaviour from remaining quality and deployment questions.

This page describes the default local implementation. Developers can supply a
different learning service while keeping the shared desktop screens; see
[replacing capabilities](../reference/replacing-capabilities.md). Its processing
scope and availability may differ from those described here.

## Who can use the knowledge?

Knowledge belongs to the local user across projects. A record's project tells
you where it came from; it does not put the record in a separate knowledge
database. Saved conversation history remains separate and is not replayed
wholesale into an assessment.

The host determines who is requesting access. A browser request or model tool
argument cannot choose a different user or invent permissions. The current local
implementation permits its owner; the shared interfaces and denial tests support
other policies without prescribing an organisation's classifications.

## Use knowledge in conversations

In **Knowledge → Settings**, choose **Use knowledge in conversations**, then
save, then confirm the displayed processing scope. Saving the preference alone
does not grant permission. It is off by default. Drawloom searches locally before sending each message
and includes up to eight permitted references, within a 12 KiB limit. This also
applies when a queued message is dispatched or you steer work already running.
Your own instructions, attachments and selected context remain intact.

Search filters candidates before choosing references. A related record is not
necessarily an answer: information about a museum's entrances does not tell us
who designed it. The agent should inspect the evidence, use what it supports and
say when the requested information is missing. Filtering reduces unrelated
material; it does not guarantee that every selected record is useful or complete.

Selected references are sent to Codex as reference material alongside your
request, not as trusted application instructions. This framing does not make
hostile instructions harmless: permissions and tool approvals remain separate
checks. The **Knowledge used** disclosure shows which references accompanied
the message. Opening their evidence checks access again.

A record too large to fit is included as a reference without its body, with an
explicit label. The agent can request its evidence through the knowledge tools.
Drawloom does not silently cut the body short or generate a replacement summary.

An enabled conversation warms an already installed search runtime in the
background; this neither downloads a model nor blocks opening the conversation.
The first preparation may take up to five seconds, later preparations two.
If retrieval is unavailable or times out, the message still goes through with
a quiet notice. That is not a claim that no useful knowledge exists.

Turning the setting off stops new automatic references. It does not remove
material from earlier Codex turns. Reopening a conversation shows your original
message, rather than attributing the added reference text to you.

The bounded selection interface is `ContextPreparer` in `@drawloom/context`;
`@drawloom/knowledge-context` uses existing knowledge retrieval and authorization.
It does not own another store. [ADR 0027](../adr/0027-complete-learning-journey.md)
records this change and its acceptance status. The
[verification record](../plans/learning-journey-verification.md) distinguishes
application checks, bounded live-model results and remaining limitations.

## From observations to learnings

**Remember useful tool outcomes** is a separate, initially off choice in Knowledge
settings. Save the preference and confirm its processing scope before capture
starts. Participating tools can retain a small, selected observation from a
validated successful result. For example, the public word-count tool retains
the count, not the text it counted. This does not collect whole transcripts or
give every installed tool permission to retain its arguments and results.

Developers opt tools in through trusted application composition using
`ToolOutcomeProjector` from `@drawloom/knowledge`. A projector receives the
validated result and may return a bounded observation body. The host assigns
its identity, originating project and provenance; the projector cannot invent
these. Existing write authorization still applies.

The host saves eligible pending intake before trying to store the observation.
After interruption, reopening can retry that intake without rerunning the tool.
Turning capture on later does not retroactively collect outcomes from earlier
ineligible calls. Failed or uncertain tool execution is not treated as success.

A configured source supplies observations and source revisions. SQLite stores
them before acknowledging receipt. To process retained evidence in the background,
enable **Curate knowledge automatically**, save, and confirm its scope in Knowledge settings. This
separate choice is off by default, including for existing settings without a
recorded choice. It sends selected evidence to the configured Codex model; local
search alone does not. **Run now** remains a separate deliberate action with its
own scope check; it does not require enabling automatic curation.

When enabled, Nightloom takes a limited batch of pending work, asks an assessor
to review its evidence, and publishes the resulting changes together with its
progress marker. Pause and budgets control new work. Turning automatic curation
off prevents new automatic assessments; an already accepted assessment remains
owned until it finishes or reaches its deadline.

A still-running assessment is checked under its original identity and deadline,
not submitted again. An unknown outcome stays held for recovery. Reopening does
not create a new allowance or assume the external model is still running.

A **lease** reserves a particular batch for a worker. A **checkpoint** records
how far processing has safely completed. Publication must use that exact lease
so results and progress cannot get out of step.

If a batch is too large, Nightloom releases it and retries with less work,
without marking any of it complete. A single item that still exceeds the limits
is reported as blocked; evidence is not silently cut off. The assessor receives
the selected root records and a size-limited set of related records and links,
with duplicates removed.

## Follow collection and curation

Activity includes **Knowledge maintenance** across all projects, even when no
project is selected. Open a run to inspect its progress and steps. This view is
read-only; maintenance controls remain in Knowledge settings. An uncertain result
is shown as needing attention, not as permission to start another assessment.

Knowledge also keeps collection and curation warnings visible when you switch
tabs. If a project source cannot connect, the command reports that failure rather
than claiming collection has started. Existing knowledge remains searchable.

Assessment limits stay locked until Drawloom finishes processing the previous
run's outcome. Its result can appear as finished before that lock is released.
A blocked save leaves your settings unchanged. Capture, automatic curation and
conversation-sharing choices remain independent of assessment limits.

## Interfaces and implementations

The types and validation rules live in
[`@drawloom/knowledge`](../../packages/knowledge/knowledge/src/index.ts).

| Interface | What it does | Local implementation |
| --- | --- | --- |
| Intake | Saves observations, claims and source revisions, checking revisions and duplicates | SQLite |
| Retrieval | Searches, opens records, follows evidence and exports permitted material | SQLite with optional local semantic search |
| Maintenance | Reserves pending work and saves changes with the matching progress marker | SQLite |
| Assessment | Reviews supplied evidence and reports completed, running or uncertain work | Signed-in Codex App Server |
| Embeddings | Converts text into numerical vectors for similarity search | Qwen GGUF through llama.cpp on Apple Silicon |
| Index work and vector index | Builds searchable vectors from specific record revisions | SQLite and sqlite-vec |

The [local runtime](../../packages/knowledge/local-knowledge-runtime/src/runtime.ts)
selects these implementations. Plugins do not select them internally. Changing
the assessor does not replace storage or Nightloom.

Changing the embedding configuration requires a new index. Its fingerprint
identifies the configuration that produced the vectors; matching vector lengths
alone are not enough to combine them.

## Local operation

Records live in `knowledge/knowledge.sqlite` beneath the selected Drawloom data
directory. History and assets keep their own storage locations.

A separate Node process owns the knowledge database because this implementation
needs sqlite-vec, which the installed Bun SQLite cannot load. The desktop stages
its Node worker dependencies using `scripts/stage-knowledge-runtime.ts`; source
launches need the normal package build first. The host and worker exchange
size-limited messages over standard input and output, not a new network or
plugin-browser API.

### Optional local similarity search

An **embedding** is a numerical representation of text used to find similar
meaning. Without the embedding runtime and model, text search remains available;
Drawloom does not silently send the text to a hosted embedding service.

The accepted replacement uses llama.cpp with Qwen GGUF weights on Apple Silicon
and Metal. It needs neither Python nor `uv`. Settings requires consent before
downloading either runtime or model, and verifies the pinned artifacts before
using them. Neither is bundled with the desktop.

The public runtime archive has not yet been published. Setup must explain that
limitation rather than offer an invented URL. Installation tests use explicitly
trusted local fixture delivery.

The llama.cpp process listens only on authenticated loopback and loads the
explicit local model. It is closed with the host. The replacement uses a new
configuration identity, separate from MLX and ONNX. Existing records remain
intact while the new index is built; incompatible vectors are never mixed.
Old MLX files are not executed. Their removal requires an explicit cleanup
action, limited to obsolete Drawloom-owned files—not knowledge or global tools.

### Reading results and evidence

Search first selects a limited set of candidates, then resolves the records the
caller may read. Evidence pages retain the identities of linked records even
when the records are on another page. Follow the continuation or open a linked
record to explore a larger chain; a page is not a promise that an entire
knowledge collection fits in model context.

OKF export creates a Markdown page following Drawloom's Open Knowledge Format
profile, including permitted records and relationships. It is an export, not
another editable database or a promise of compatibility with every OKF bundle.

## Sources and disclosure

The Git MCP package owns the configured repositories and paths it reads.
Installing it or changing a model setting does not start collection: the user
must select the installed source for a project. Collection acknowledges data
after it is saved, not after a model call succeeds. Stopping collection does
not delete previously retained knowledge.

Embedding inference runs locally. **Codex assessment does not:** the selected
evidence is sent to the configured Codex destination. Assessment receipts and
Codex's native history are separate copies from the SQLite knowledge records.
Deleting a knowledge record does not currently erase those copies. Do not
promise enterprise retention or complete deletion based on local record removal.

Repeated evidence-tool reads can omit unchanged bodies only after matching
delivery has been observed in the same execution. The host still checks current
access on every read. Changed records, a new execution, restart or observed
compaction require sending the evidence again. A history disclosure is not a
receipt proving what the model currently remembers.

Nightloom removes duplicate revisions within one assessment request and measures
the full evidence package's UTF-8 size. Independent assessments still receive
their own supporting evidence; an earlier transfer does not establish what a
fresh assessor can see.

## Current limits

- Retained evidence includes verified model downloads and small synthetic search
  evaluations. Broader retrieval value and 100,000-record semantic search remain
  unproven; see the ADR measurements for resource costs and test conditions.
- Nightloom accepts up to 50 work units per batch within the evidence limits.
  Retained live evidence includes a two-root assessment and a separate two-unit
  Temporal batch, not every larger maintenance journey.
- The source UI selects one active Git feed. Cross-project knowledge storage is
  not simultaneous scheduling of multiple repository feeds.
- SQLite tests, scripted model responses and live assessments prove different
  things. None alone establishes enterprise policy deployment or judgement
  quality across real workloads.

For a change to this system, test the affected interfaces and the full source,
curation or retrieval journey. Keep provider calls opt-in and use synthetic
records for public tests.

After building packages, `bun run test:temporal` checks the real workflow service
and `bun run test:orchestration:learning` checks Nightloom recovery with SQLite through
the orchestration contract, using the Temporal implementation. These
commands use isolated local services and do not call an answering model. They
require the exact Node and Temporal versions enforced by the local manager; the
dedicated learning CI job installs those versions. Unavailable services are
failures, not skipped acceptance. Live answer-quality checks remain separate.
