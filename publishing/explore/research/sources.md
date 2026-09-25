# Sources for "Investigations" (step 3)

For verification only; not published. Paths are relative to the repository root.

## Method

- Five-step routine (question, references, read code at a named version, spike, record the decision): synthesis of CONTRIBUTING.md "Reference-led changes and approval"; AGENTS.md area guides; spikes/README.md; each survey's revision tables (e.g. docs/reference/harness-workbench-survey/README.md "What the refresh changed"; docs/reference/knowledge-memory-survey/sources.json).
- Decision test (real need, smallest change, verify by test/spike/measurement): docs/adr/0006-evidence-led-architecture-principles.md "Apply a decision test", questions 1, 3 and 6.

## Two references

- Compare Rosalind and DeepSeek Harness before plugin interface changes; stop and ask the maintainer if they differ; bring example, evidence, smallest alternative: CONTRIBUTING.md lines 99-117; AGENTS.md "Apply proven boundaries before invention" ("a working demo or generic naming is not approval").
- Rosalind is an OpenAI/Codex workbench plugin: CONTRIBUTING.md line 105 ("OpenAI/Codex's Rosalind"); docs/reference/mcp-apps-host-evidence.md "What was observed" (Rosalind Workbench plugin, OpenAI-specific metadata, first-party bridge extensions).
- DeepSeek owns a harness runtime and its host: docs/reference/harness-workbench-survey/README.md line 5. Described as "public" (not "open source") because a licence for it was not checked for this page.
- Rosalind serves MCP HTML; DeepSeek loads client modules into its host; MCP Apps selected; DeepSeek contributions a reference, Cordis registry and hot lifecycle not adopted: docs/adr/0013-plugin-boundaries-and-host-integration.md table at lines 131-137.

## Surveys

- Harness survey subject (history, artifacts, plugins, host) and "Open Design builds a rich product around native agent runtimes": harness-workbench-survey/README.md line 5 and "What we should take away".
- Eight systems; capture/maintenance/recall lifecycle; "No common algorithm emerges"; three different facts (source read, derivation saved, dependents current): knowledge-memory-survey/README.md "Coverage and freshness" and "2. Maintenance is where implementations differ most".
- Seven evaluation products; three jobs; "A score is not permission, business acceptance or publication": evaluation-survey/README.md "Start here" and "Product summary".
- Authorization: AuthZEN and NIST SP 800-162 plus Cedar and Casbin, local experiment: authorization-survey/README.md opening and "Source-pinned implementation paths".
- Repository walk-through; "Clicking a diagram node does not mean its files have been reviewed": repository-audit/README.md "Review protocol".

## Limits

- No upstream application, provider call, test suite or build run; representative test bodies read: harness-workbench-survey/README.md line 149.
- No vendor services or models run; source-inspected behaviour not integration proof: evaluation-survey/README.md lines 3-6.
- Refresh before finalising; DeepSeek 1,477 new commits; material corrections: harness-workbench-survey/README.md "What the refresh changed".
- Letta main repository now redirects to Letta Code; current Mem0 extraction additive: knowledge-memory-survey/README.md "Coverage and freshness", bullets after the table.
- ADR 0023 proves neither full AuthZEN conformance nor NIST compliance: docs/adr/0023-knowledge-memory-authorization-boundaries.md line 145.
- Casbin faster in tiny unoptimised probe; speed alone does not select the engine: authorization-survey/README.md "Candidate fit, not a selection". Numbers deliberately omitted (see knowledge/evidence/adr-0023-authorization.md table at line 65).
- Only public reference code; no private code, prompts, data copied: harness-workbench-survey/README.md line 154. Page generalises to "the surveys"; the other surveys state public checkouts (knowledge-memory-survey/README.md, evaluation-survey/README.md, authorization-survey/README.md) but only the harness survey states the no-private-copy sentence explicitly. Mildly generalised.

## Spikes

- Spikes outside the product; check rejects imports into spikes/: spikes/README.md lines 1-19; spikes/AGENTS.md.
- A passing spike is evidence for review; does not accept an ADR or authorise copying code: spikes/AGENTS.md last bullet.
- First memory sprint: seven fresh Codex conversations; capture, maintenance, recall, contrary evidence; does not demonstrate improved task success; reader refused to infer a weekend rule from sparse evidence: knowledge/evidence/adr-0022-memory-sprint.md "Outcome". ADR 0022 is now Accepted (docs/adr/0022-knowledge-memory-context-experiment.md line 3); the sprint was run when it was Proposed.

## Thank you (lesson and URL source)

URLs for GitHub projects are the repository root prefix of revision-pinned links in the named sources; non-GitHub links are copied as given.

- DeepSeek Harness, github.com/deepseek-ai/deepseek-harness (knowledge-memory-survey/sources.json line 85): separate authoritative history, cached derived views and bounded client windows (harness survey "1. Our history concern is real").
- Open Design, github.com/nexu-io/open-design (sources.json line 95): app conversation, physical execution and native provider session are different identities (same section).
- Rosalind: no public link; mcp-apps-host-evidence.md says original source and an open-source licence were not established. Benchmark role: ADR 0013 line 15. First-party extensions: mcp-apps-host-evidence.md.
- OpenAI Codex, App Server README link as given in docs/plans/0032-native-delegation-and-forks.md line 28. Source read for tool calls: knowledge/evidence/adr-0008-tool-execution.md lines 100-103.
- MCP Apps, modelcontextprotocol.io/extensions/apps/overview: docs/reference/plugin-settings.md line 29; ADR 0013 line 16.
- Hindsight (sources.json line 9): "closest inspected reference for separate evidence and background consolidation" (knowledge survey "Treat Nightloom as a maintainer").
- Graphiti (line 19): temporal claim invalidation (same section; maintenance table).
- Letta Code (line 45): successful-work checkpoint (same section).
- Mem0 (line 55): "successful-looking output does not prove every write succeeded" (maintenance table).
- A-Mem (line 65): notes reshape nearby notes; not a ready durable service (maintenance table; freshness bullets).
- HippoRAG (line 75): source-aware removal (same section).
- LongMemEval (line 105): benchmark (research-and-evaluation.md "Evidence boundary"). Lesson phrased generally.
- Sleep-time Compute (line 115): offline inference to rewrite known context before future queries (research-and-evaluation.md "Evidence boundary").
- MINJA (line 125): memory injection via query-only interaction (research-and-evaluation.md "Evidence boundary").
- SEPIO (sepio-linkml, line 146) and PROV-O (www.w3.org/TR/prov-o/, vocabularies.md line 25): provenance vocabulary; "does not determine whether that knowledge is true".
- Promptfoo, Arcade MCP, DeepEval, Langfuse, Braintrust SDK, Autoevals, LangSmith SDK: evaluation-survey/README.md "Product summary" (lessons); root URLs from revision-pinned links in evaluation-survey/*.md and *.architecture.json. Arcade "tool-choice tests are not tool-effect tests": same README.
- NIST SP 800-162 and AuthZEN URLs and lessons: authorization-survey/README.md "What the standards supply".
- Cedar and node-Casbin root URLs: prefixes of links in authorization-survey/README.md table.
- OpenTelemetry, opentelemetry.io/docs/languages/js/: docs/adr/0019-useful-observability.md line 72; content-free attributes, not transcript storage: AGENTS.md observability area guide.
- Archify, github.com/tt-a1i/archify (sources.json line 156): rendered the survey maps (harness survey "Method"; repository-audit README).

## Unverified or omitted

- No licence claim made for DeepSeek Harness or Open Design.
- Did not claim any upstream test was run, or give authorization timing numbers.
- Did not name every product the surveys mention (e.g. Letta server, SEPIO ontology, DQV, nanopublications, Web Annotation, llama.cpp, oMLX, CopilotKit) to keep the list to projects that visibly shaped a decision or survey conclusion.
