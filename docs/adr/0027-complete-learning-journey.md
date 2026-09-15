# ADR 0027: Bring retained learning into everyday conversations

- Status: Accepted
- Date: 2026-09-15
- Accepted: 2026-09-15
- Partially supersedes: [ADR 0024](0024-local-knowledge-memory-and-retrieval.md), specifically tools-only context preparation.

## Purpose

Drawloom should help an agent benefit from earlier work without requiring the
user to remember which knowledge record to request. Implement capture, curation
and bounded recall as supported product capabilities, not another experiment.

SQLite remains the record of knowledge. Nightloom continues to coordinate
assessment and publication. Context preparation selects useful records for a
request; it neither creates another store nor grants access to tools or data.

## Provider check before implementation

On 2026-09-15, the installed `codex-cli 0.153.4` generated experimental JSON
schemas for both `turn/start` and `turn/steer`. `AdditionalContextKind` lists
`untrusted` and `application`; the field description calls these client-provided
fragments keyed by an opaque source identifier. This proves the declared wire
shape, not the model-side treatment or resistance to hostile instructions.

Reproduce the schema inspection with `codex app-server generate-json-schema
--experimental --out <temporary-directory>`. SHA-256 of generated files:
`v2/TurnStartParams.json`:
`b36fb37326b1cf69f75c8b306f1f886d53a57c4b1b985e08e298e2407ea2ad02`;
`v2/TurnSteerParams.json`:
`2e0cdcea6a90d6c8bc584fdc2ff838e824754b1eef0d2d16aa71bec4276fef44`.
No model call was made by schema generation.

The existing Drawloom adapter exercises `application` only. Until stronger
semantic evidence exists, use the maintainer-approved user-content fallback.
Retrieved evidence must not be placed in developer/application instructions.
Reference framing is explanatory, not a security boundary. Independent grants,
authorization decisions and approval remain necessary.

The native history reader joins user text parts. Therefore fallback delivery
must preserve the original submitted text through durable correlation, including
restart and steering; generic marker stripping is not acceptable. Host-provided
references must not subsequently appear as words the user typed.

## Decisions

- Prepare bounded knowledge references before normal submission and steering,
  using the current request and verified identity/binding. Limit references to
  eight and serialized material to 12 KiB. Large records receive explicit
  reference-only entries, not silently truncated bodies.
- Filter candidates before ranking. The local text search excludes a small set
  of English function words rather than matching records on words such as
  “the” alone. The pinned Qwen GGUF path admits semantic candidates at cosine
  similarity 0.52 or above before combining ranks. This provider-specific floor
  was frozen using separate calibration examples before rerunning the existing
  evaluation cases. Shared relevance scores remain ordering values, not
  confidence or universally comparable similarity. If nothing qualifies,
  preparation is empty. These heuristics reduce noise; they do not guarantee
  relevance, factual correctness or resistance to hostile text.
- Distinguish relevant references from sufficient answers. Related records may
  be supplied even when they do not contain the requested fact. The agent must
  inspect the evidence and acknowledge missing information, not infer an answer
  from a matching subject. The maintainer approved this boundary after the first
  admission experiment: a higher similarity threshold removed useful evidence
  without separating topical but unanswered cases. Do not add a separate
  answer-sufficiency classifier. Preserve the original evaluation results and
  their recall cost; see the [acceptance evidence](../../knowledge/evidence/adr-0027-learning-journey.md#relevance-admission-follow-up).
- Recheck reading and disclosure permissions before returning material for
  submission. Cancel obsolete preparations and never disclose denied metadata.
  These are checks for each record at the time of access, not an atomic snapshot
  across separate storage and policy services. The host also checks that its
  grants and disclosure settings have not changed before sending. A later policy
  change cannot recall material already authorized and sent.
- Warm an installed local embedding runtime without downloading or making
  external model calls. Allow five seconds for first preparation and two for
  subsequent preparation. Failure does not prevent a normal message.
- Keep receipt deduplication within an execution. Resend changed evidence and
  do not infer retained model context across turns, compaction or restart.
- Participating tools may project selected useful observations through trusted
  composition, with explicit capture enablement and host-assigned provenance.
  Non-participating tools retain status-only capture. Do not mine transcripts.
- Deduplicate maintenance evidence within a request. Independent assessments
  still receive necessary evidence; cross-assessment caching is deferred because
  an earlier transfer does not establish what a fresh assessor can see.
- Run maintenance through the desktop's own background lifetime. Pause,
  readiness and budgets govern new work. Automatic curation requires its own
  saved, default-off choice: neither selecting a model nor an existing unpaused
  coordinator grants permission to disclose retained evidence. Disabling it
  prevents new automatic assessments without erasing earlier disclosure or
  abandoning an already accepted assessment. Once an assessment is accepted and
  still running, check that same assessment until it finishes or reaches its
  deadline; do not submit it again or charge another start merely to check it.
  Unknown outcomes remain held for recovery, not treated as permission to retry.
- Disabling automatic disclosure stops new additions; it does not erase native
  turns already sent. Model-backed acceptance is qualified as Apple Silicon/Metal.

## Reference comparison

The retained [DeepSeek survey](../reference/knowledge-memory-survey/deepseek.md)
separates context admission from retention and native compaction. The retained
[Open Design survey](../reference/knowledge-memory-survey/open-design.md) shows
memory composition in normal workbench use, but its full active-set projection
is not a bounded query-dependent selection strategy. Drawloom adopts explicit
composition while retaining its own authorization and size-limited retrieval.
These are source-inspected references, not fresh upstream runtime tests.

## Closing ADR 0022's weaknesses

| Earlier weakness | Product treatment and acceptance |
| --- | --- |
| Repeated maintenance reads | Deduplicate exact revisions per request; measure evidence bytes. Retain necessary fresh-assessor inputs rather than unsafe cross-assessment caching. |
| Broad lexical retrieval | Exercise frozen relevant, irrelevant and paraphrased cases with and without the installed GGUF model; assess resulting answers as well as hits. |
| Input friction and arbitrary limits | Preserve bounded responses, explicit reference-only oversize behaviour and actionable failures; cover revision races and non-ASCII sizes. |
| Uncalibrated domain judgement | Preserve contrary, withdrawn and source-revision cases. No universal confidence or domain reliability claim. |
| Disposable storage/intake | Use supported SQLite, source intake and Nightloom; enforce restart and interrupted-work tests in a separate Temporal CI lane. |
| Limited safety/provider evidence | Test denied disclosure and hostile bodies in both assessment and foreground reading. Scripted checks do not establish universal prompt-injection resistance. |

## Acceptance status

The supported implementation and the relevance boundary above are accepted.
The first bounded live run
verified tool capture but stopped before curation completed. It exposed missing
background scheduling and continuation of an accepted assessment. Those gaps
now have reviewed fixes and passing local recovery tests. Later live runs verified
capture, curation, fresh recall, hostile-reference handling, contrary evidence,
stale-source qualification and the frozen three-mode comparison. The final
canonical repository gate passed. A fourth live run exercised the current
filter and guidance: capture and curation completed and the three comparison
answers were correct, with tool-use errors and remaining noisy search matches
explicitly retained. This does not
establish reliable model compliance with every guidance instruction. The fixed
filter's recall losses also remain recorded, rather than being tuned away against
the inspected cases. These are bounded synthetic results, not a provider trust
guarantee, large-corpus quality claim or release declaration.
The [delivery plan](../plans/2026-09-15-complete-learning-journey.md)
records the scenario-by-scenario results. Supported application checks,
embedding conformance, actual Temporal recovery and explicitly approved live-model
runs provide distinct evidence; skipped tests do not satisfy those requirements.
The default gate runs embedding conformance with the real adapter and SQLite but
a scripted worker. The installed GGUF worker variant was run separately on Apple
Silicon; it remains opt-in in CI. Public runtime archive publication is separate
from this acceptance and from a working text-search installation.
New checks are recorded in the [evidence record](../../knowledge/evidence/adr-0027-learning-journey.md),
separately from retained historical investigations.
