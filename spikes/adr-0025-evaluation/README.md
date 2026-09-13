# ADR 0025 retained evaluation comparison

Non-production, public synthetic evidence for
[Proposed ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
Neither runner is selected for supported Drawloom packages. Keep all imports of
this experiment inside `spikes/`.

The first sprint compares Promptfoo 0.123.0 with Braintrust 3.32.0 and Autoevals
0.3.0 under Node 24.20.0. Root Bun catalog pins own the versions. Actual consumer
conformance, rather than wrapper names or mocked library calls, is the proof.

## Isolation

`isolation.mjs` launches a fresh Node process through macOS `sandbox-exec` with
all network operations denied. It constructs a clean environment and temporary
configuration/cache directories. `observer.mjs` passively records Node diagnostic
channel names/counts, never URLs, request bodies or credentials. These channels
overlap and do not cover every possible native library; OS denial covers the
process irrespective of the observer. No vendor function is replaced.

The launcher has a bounded deadline/output buffer and terminates a hung process
group. This means the measurement process stopped; it does not claim cancellation
of arbitrary external effects. Other operating systems fail explicitly rather
than running the proof with weaker isolation.

Local isolation checks:

```sh
bun test spikes/adr-0025-evaluation/isolation.test.ts
```

The canonical tests use public synthetic data. Real vendor checks run separately
through the network-denied launcher; no accounts, model calls, paid media,
production ingestion or optional runtime downloads are required.

See [authoritative evidence](../../knowledge/evidence/adr-0025-evaluation.md) for
actual results, limitations and the later acceptance gates. Existing-output
assessment is not generation, scoring failure is not poor quality, and feedback
does not accept the underlying work.

## Run the comparison

From the repository root, with the pinned dependencies installed:

```sh
bun run spike:adr-0025
```

The launcher prints a newly created temporary directory containing
`measurements.json`, per-adapter reports and local diagnostic logs. It refuses
overwriting an existing output directory. For an explicit new destination:

```sh
node spikes/adr-0025-evaluation/verify-local.mjs --out /private/tmp/drawloom-eval-new-run
```

Do not launch `run.ts` directly in an ordinary user environment. The launcher
owns clean configuration, network denial, recording and process deadlines. It
runs 39 shared checks and 30 independently timed warm calls per adapter, with
separate cold-import probes and dependency measurements. The final evidence keeps
sanitised summaries and source hashes, not raw vendor console output. Cold means
a fresh process, not an empty operating-system file cache.

Fast canonical checks (no vendor execution):

```sh
bun test spikes/adr-0025-evaluation
bun run check:types
bun run check:architecture
```

`tsconfig.portable.json` checks contract and consumer fixtures without host types.
`tsconfig.node.json` checks adapter source strictly but skips vendor declaration
checking: Promptfoo's transitive database declarations fail the repository's
full library check. This narrow exception does not change supported-package or
portable checks. No third-party source is patched or added to supported runtime
dependencies.

## Candidate interface map

| File | Responsibility |
| --- | --- |
| [contract.ts](contract.ts) | Portable schemas and callable interfaces; expected values never enter Target |
| [fixtures.ts](fixtures.ts) | Vendor-free document target, deterministic/scripted scorers and generated WAV |
| [common.ts](common.ts) | Request/result validation and explicit Autoevals scorer composition |
| [promptfoo.ts](promptfoo.ts), [braintrust.ts](braintrust.ts) | Native runner scheduling and result projection |
| [conformance.ts](conformance.ts) | Same consumer checks, authorized media, cancellation and persisted comparisons |
| [result-files.ts](result-files.ts) | Simple local JSON results and attributed feedback |
| [run.ts](run.ts) | Selected-adapter measurements; no provider/model calls |

There is one target configuration per run. Compare separately identified runs;
do not add another configuration registry. `assess-existing` uses supplied
output without invoking a target. Scoring failures preserve successful sibling
findings. `unscored` preserves completed work when cancellation prevents remaining
scoring. Abort stops new callbacks, but active cooperative callbacks must settle;
the proof does not force-stop arbitrary external effects or implement durable
execution recovery. Start events are live; finish events are currently delivered
when the final results are projected.

The JSON store is deliberately sequential and disposable, not a database or a
concurrent persistence provider. Native report summaries are diagnostic output,
not the authority for Drawloom findings: particularly, Promptfoo's numeric error
placeholders must not become Drawloom quality scores.

## Existing-media consumer sprint

`node spikes/adr-0025-evaluation/audio-proof.mjs` runs the contrasting public
podcast-preview consumer through Braintrust under OS network denial. It prepares
independent PCM fixtures before assessment, then scores stored content through
the existing authorised asset-reader seam. The printed temporary directory holds
results, feedback, measurements and logs. The following checks technical
regressions, access refusal and reader cleanup without a vendor call:

```sh
bun test spikes/adr-0025-evaluation/audio-delivery.test.ts
```

This is a narrow consumer, not a general WAV library or listening-quality judge.
See [second-sprint evidence](../../knowledge/evidence/adr-0025-media-consumers.md).
The private video consumer lives separately and is never required by public CI.

## Native tool effects and Codex judge sprint

This later bounded proof reuses the supported Codex agent boundary, native review
mapping, tool bridge, local gateway and Braintrust candidate runner. It does not
add a reviewer or bridge. `passage-tool-effect.test.ts` deterministically separates
tool selection, native authority and protected-handler effect across approval,
denial, revocation, changed arguments and stale approval. `codex-passage-judge.ts`
implements a structured four-criterion scorer whose input contains only the
editing request, source passage, candidate result and rubric; frozen expected
labels and case identities remain outside the model request.

Run the focused offline checks from the public repository root:

```sh
bun test spikes/adr-0025-evaluation/codex-passage-judge.test.ts \
  spikes/adr-0025-evaluation/codex-live-observer.test.ts \
  spikes/adr-0025-evaluation/codex-judge-live.test.ts \
  spikes/adr-0025-evaluation/passage-cases.test.ts \
  spikes/adr-0025-evaluation/passage-tool-effect.test.ts
bunx tsc --noEmit -p spikes/adr-0025-evaluation/tsconfig.node.json
```

The live judge launcher requires Node and an explicit parent-process diagnostics
observer. It creates a fresh isolated working directory and Codex session for each
case, persists exact recovery identities before risky work, and archives only
after a known terminal outcome and writer closure. Use `--prepare-only` to inspect
the bounded plan without a Codex request. Actual live invocation is intentionally
operator-owned because it consumes native Codex turns.

Per-invocation receipts hold last-turn token usage, requested/observed model,
elapsed time and source-filtered tool-activity counts. Those observations are
proof diagnostics, not a supported usage contract: the candidate result shape
cannot yet attribute target versus individual scorer usage. Parent diagnostics do
not cover the intentionally networked Codex child or prove ambient native-tool
isolation. Human-review choices in the private counterpart are scripted responses
under test authorization, not claims of manual clicks.

## Frozen knowledge findings inspection

`knowledge-inspection.ts` reads the frozen public knowledge corpus and two retained
ADR 0024 reports. It passes 48 current lexical/MLX retrieval outputs and 72
historical CPU answer outputs through the Braintrust candidate in
`assess-existing` mode. Two copied-output regressions prove case-local diagnosis;
they are labelled synthetic and never replace actual retained results. Source,
corpus and revision hashes are validated. No retrieval, answer, target or model is
run. Required-chain findings mean required references appeared in the retained
top-k; they are not a claim that the evidence traversal API ran.
This inspection consumer replays retained results; the fresh lexical 10,000-record
and evidence-API checks are recorded separately in the
[knowledge and presentation evidence](../../knowledge/evidence/adr-0025-knowledge-and-presentation.md).

Build a self-contained installed package in a new temporary/runtime folder:

```sh
runtime="$(mktemp -d /private/tmp/drawloom-inspection.XXXXXX)"
bun spikes/adr-0025-evaluation/inspection-build.ts --out "$runtime/package"
```

In the existing desktop, add the resulting `package` folder under Plugins. Enable
its `inspection` server, explicitly trust its small placement backend, and restart
Drawloom. Open the **Evaluation findings** workbench. The package reads only its
installed `inspection.json`; the App cannot supply paths. Attributed feedback is
an entered, unverified label, is advisory only, and persists separately at the
installation/project-scoped `PLUGIN_DATA/feedback.json`. It never changes scores
or accepts source work.

Focused checks:

```sh
bun test spikes/adr-0025-evaluation/knowledge-inspection.test.ts \
  spikes/adr-0025-evaluation/inspection-server.test.ts \
  spikes/adr-0025-evaluation/inspection/inspection-view-model.test.ts \
  spikes/adr-0025-evaluation/inspection-build.test.ts
bunx tsc --noEmit -p spikes/adr-0025-evaluation/tsconfig.node.json
bunx svelte-check --workspace spikes/adr-0025-evaluation/inspection \
  --tsconfig ./tsconfig.json --threshold warning
```
