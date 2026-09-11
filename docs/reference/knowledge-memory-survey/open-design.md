# Open Design: editable memory and deliberate context injection

## Evidence boundary

Inspected 11 September 2026 at `933dc96038a4ee7a30c56d479f3497ad2716cbb3`, cleanly fast-forwarded from `81044a03`. Source and selected test bodies were read; no provider calls or upstream tests were run. Root [licence](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/LICENSE) is Apache-2.0. This focused memory inspection supplements, rather than rewrites, the [older broad inventory](../harness-workbench-survey/open-design.md).

Open Design is especially useful as a consumer reference: memory is wired into actual workbench prompt composition, editing and user feedback, not merely exposed as a storage API.

## Lifecycle

### Capture is distinct from injection

The current configuration enables use of existing memory by default, but **chat auto-extraction is off by default**. Source comments explain that earlier heuristic extraction produced incorrect facts from ordinary chat wording. Explicit opt-in restores the heuristic and LLM paths. The public lesson is not that automatic maintenance requires human approval; it is that collecting a conversation and confidently interpreting it are different operations. [Defaults](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory.ts#L198), [actual capture gate](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory.ts#L1082).

The host calls heuristic extraction on an initial user-message attempt before prompt composition. Extraction failure is best-effort and does not fail the agent run. The LLM extraction path has a separate proposal parser and writer. `suggestWithLLM`, `distillAnnotationsToMemory` and `extractWithLLM` serve different callers. Annotation-derived candidates are constrained to feedback/rule categories instead of generating arbitrary profile facts. [Host hook](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/server.ts#L10935), [LLM and annotation entrypoints](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory-llm.ts#L1366).

### Persist readable entries, then select an active set

`upsertMemoryEntry(dataDir, input, options)` writes a Markdown entry with a stable or derived ID, then ensures its index link exists. The entry records its production route such as manual or LLM. `deleteMemoryEntry` removes the file and index link. These are straightforward file operations, not an atomic multi-record database transaction or a source-dependency graph. [Storage operations](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory.ts#L507).

`MEMORY.md` is more than a directory listing: its links select which existing entries become active context. Removing a link suppresses prompt injection without deleting the retained file. This is an important lifecycle distinction—stored does not mean selected, and selected does not mean inherently true. [Active-set parsing](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory.ts#L549).

### Compose context at run time

`composeMemoryBody(dataDir)` reads configuration, lists entries, filters them through the index, groups them by type, reads bodies and renders a prompt section. Profiles and rules have particular presentations. The host recomputes this body at composition time so edits can affect the next run. This inspected function does not implement a query-dependent semantic search or a bounded retrieval page. It can read all listed entry metadata and the bodies of the active set. [Composition](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory.ts#L620), [host integration](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/server.ts#L9978).

The prompt builder treats memory as preference/context, with explicit precedence relative to design-system tokens and active skills. It also adds intent-rewrite and self-verification instructions when enabled. This is application policy, not a neutral property of knowledge storage. [Prompt integration](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/prompts/system.ts#L1210).

Native continuation remains separate. A valid provider resume permits omission of the app transcript; without a compatible native handle the fallback requests full transcript composition. That mechanism does not make personal-memory files a replacement for the provider's session. [Resume policy](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/agent-session-resume.ts#L115).

### Feedback and verification are not truth maintenance

Rule entries feed an output self-verification rubric. `enforceVerify(input)` checks whether the response contains a scorecard, whether active rules were covered, and whether rows report failure. It does not independently prove the factual accuracy of the output or assess the source quality of a stored claim. Recent verification records are an in-process bounded ring, not durable evidence history. [Verifier](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory-verify.ts#L82).

LLM extraction avoids repeated work with a bounded process-local signature set keyed by conversation/message/reply when a real conversation identity is supplied. A successful provider call records the signature; restart can legitimately cause re-examination, and callers without a conversation ID do not receive this dedupe. That is not the durable processed-source waterline needed for Nightloom. Individual candidate-write failures are caught and logged. [Dedupe and collection](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory-llm.ts#L1175), [candidate writes](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/memory-llm.ts#L1451).

## Concrete interfaces and ownership

| Existing entrypoint | Owner | Boundary lesson |
| --- | --- | --- |
| `upsertMemoryEntry / readMemoryEntry / deleteMemoryEntry` | File-backed memory module | Explicit record identity and editing. |
| `readMemoryIndex / writeMemoryIndex` | Memory module, user-editable selection | Retention and context participation differ. |
| `composeMemoryBody` | Host prompt path | Retrieval/formatting policy is not storage. |
| `extractWithLLM / suggestWithLLM` | Extraction path | Generation of a candidate and saving it are separable. |
| `listActiveRuleEntries / enforceVerify` | Product verification flow | Operational rules need deliberate authority and precedence. |

Although entries have type-derived project/global labels, this inspected composition accepts the global data directory and no project identity. Those labels are not evidence of enforced project isolation or enterprise entitlements. A future shared backend cannot obtain access control merely by preserving the same folder categories.

## Tests read and remaining gaps

The [default-off regression](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/tests/memory-extraction-default-off.test.ts#L23) checks that marker-like ordinary chat writes nothing under default configuration and that explicit opt-in still works. We read its body; no passing execution is claimed.

This implementation provides a practical file-first authoring model and clear context selection. It does not establish evidence-backed confidence, automatic dependency invalidation after source change, independently calibrated verification, durable consolidation recovery, or fine-grained multi-user authorization. Those are distinct missing demonstrations, not proof that readable files cannot support them.

## Lessons for Drawloom

Borrow the readable records, explicit active selection, visible editing and ordinary prompt integration. Do not automatically copy the full-active-set read path for a large corpus, process-local dedupe as a recovery guarantee, or promotion of learned text into operational rules.

For the proposed autonomous Nightloom, Open Design supplies a valuable negative case: careless interpretation can create junk facts. Preserve observations separately from conclusions and make retrieval expose the difference, without inserting the human approval gate explicitly excluded from Drawloom's memory design.

[Open the source-linked map](open-design.html).
