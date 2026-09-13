---
type: source
id: adr-0025-evaluation
title: Evaluation boundaries and comparative proof
status: active
created: 2026-09-12
updated: 2026-09-13
---

# Evaluation boundaries and comparative proof

This public synthetic experiment supports [Proposed ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
It is not a supported evaluation implementation or acceptance of the ADR.
The [survey](../../docs/reference/evaluation-survey/README.md) owns the source
comparison. The [proof README](../../spikes/adr-0025-evaluation/README.md) owns
reproduction commands and exact execution boundaries.

## Sprint and method

Started 12 September 2026 at 20:21:49 UTC, with a one-hour checkpoint and a
two-hour stop. Public candidate schemas/consumers remain separate from Node
vendor adapters. No private files, hosted accounts or live model calls are used.

Pinned npm versions: Promptfoo 0.123.0 (MIT), Braintrust 3.32.0 (Apache-2.0),
Autoevals 0.3.0 (MIT). The Bun install added 662 packages. Optional install scripts
remain blocked; no model/browser download scripts or Braintrust CLI installer
were enabled for this proof. Installed SDK functionality is measured rather than
inferred from installation. A subsequent frozen install made no changes.

## Verification log

- Launcher RED: three tests failed against stub implementations before changes.
- Launcher GREEN: three tests passed, 15 assertions. A real macOS sandbox denied
  fetch, HTTP and TCP calls to a controlled local server; the server received zero
  requests. A hung child was terminated and reported as a timeout.
- The observer subscribes to standard Node diagnostic channels. It records event
  types/counts only. Socket creation and HTTP events can overlap; these are not
  counts of unique requests. OS denial, not the observer, enforces the boundary.
- Environment construction uses an allowlist, temporary configuration directories
  and no provider credentials or proxy/preload inheritance. This is network
  isolation for a public proof, not a general filesystem sandbox for plugins.

## Comparative result

**Recommendation for the next consumer sprint: Braintrust's local runner with
Autoevals. This is not a supported-backend decision.** Both real runners passed
the same 39 checks. Braintrust used less time and memory on these small cases,
has a smaller installed dependency closure, and made no observed network attempt.
Its scorer API also represents absent scores without a numeric placeholder.
Promptfoo remains a credible experiment/CLI integration; its wider feature set is
not being judged by these two document cases.

The [machine-readable measurements](adr-0025-evaluation-measurements.json) retain
all check outcomes, exact versions, source hashes, timings, call counts, network
events and dependency summaries. Recorded at 20:46 UTC on an Apple M2 Ultra,
24 logical CPUs, 64 GiB RAM, macOS arm64, Node 24.20.0, Bun 1.2.23.

| Measurement | Promptfoo + Autoevals | Braintrust + Autoevals |
| --- | ---: | ---: |
| Shared checks | 39 passed | 39 passed |
| Warm two-case run, median / p95 | 2.08 / 2.74 ms | 0.148 / 0.278 ms |
| Runner overhead, median / p95 | 2.06 / 2.71 ms | 0.135 / 0.231 ms |
| Direct fixture calls, median / p95 | 0.008 / 0.029 ms | 0.006 / 0.017 ms |
| Whole-process peak RSS, including conformance | 333 MiB | 144 MiB |
| Warm runs plus direct baselines, user / system CPU | 93.7 / 6.4 ms | 7.6 / 1.0 ms |
| Warm runner target / scorer calls | 60 / 120 | 60 / 120 |
| Serialized warm results, 30 runs | 33,989 bytes | 34,162 bytes |
| Installed combined dependency closure | 899 folders, 1.90 GiB | 168 folders, 111 MiB |
| Observed HTTP-request / socket events | 1 / 1, blocked | 0 / 0 |

Cold fresh-process **import** probes, separate from the warm runs:

| Library | Import time | Process start-to-exit | Peak RSS |
| --- | ---: | ---: | ---: |
| Promptfoo | 539 ms | 586 ms | 287 MiB |
| Braintrust | 93 ms | 139 ms | 93 MiB |
| Autoevals | 70 ms | 116 ms | 74 MiB |

These are cold JavaScript processes with an already installed, filesystem-cached
dependency tree, not cold operating-system disk caches. Each warm observation
is an independent sequential `runner.run`, two cases, one trial, concurrency one.
Overhead subtracts the **union** of actual callback intervals from runner wall
time, counting overlapping scorers once. The separate direct baseline executes
the same callbacks without a vendor runner. Its calls are additional to the
reported runner call counts. Synthetic work is intentionally tiny: this is
overhead evidence, not a prediction of video or model performance. Cost is
unknown, not fabricated as zero; no model was invoked.

Dependency figures are logical regular-file bytes in this checkout's resolved
dependency/optional/peer closure, deduplicated by actual package folder. They are
**not incremental installation or download costs**. Combined closures include
Autoevals once. Promptfoo's closure includes broad provider runtimes, two reachable
Codex package versions and ONNX libraries that this proof never invokes. A fresh
minimal installation may differ. The survey's licences cover the inspected
libraries, not a completed licence audit of every transitive dependency.

## Interfaces and proof coverage

- [Portable candidates](../../spikes/adr-0025-evaluation/contract.ts) define cases,
  targets, scorers, results, feedback and runner requests. Input/output parsers
  belong to the target. Expected material goes only to scoring, never the target.
- [Shared conformance](../../spikes/adr-0025-evaluation/conformance.ts) runs against
  each real SDK. Native repeat/concurrency scheduling is used; no second runner
  engine is hidden in the adapters.
- Saved-output assessment executes zero targets. The actual Autoevals ExactMatch
  scorer and a clearly scripted judge run through the same supplied scorer path.
  Invalid/scorer-error/denied/timeout/uncertain outcomes remain separate from poor
  quality; no automatic target retry occurs.
- Reverse-completing trials retain their own output and scorer identity.
  Duplicate case/scorer identities are rejected. Per-case time ends at settlement,
  not when unrelated later cases finish. Start progress is observable before the
  result; finish notifications are currently emitted at final projection.
- An independently generated PCM WAV is read by a composed header/duration scorer
  through an explicit permitted-key set and the existing Node asset store. An
  unpermitted reference is refused before reading. Source bytes are unchanged.
  This proves selected-media access and technical checks, not audio aesthetics,
  large-media efficiency or a production authorization composition.
- Baseline and current results for both cases reload from JSON with exact-result
  feedback. Comparison after reload finds delta 0 on the unchanged case and -1
  on the deliberately regressed case. Feedback does not accept business work.

## Mismatches and fixes discovered

1. **No-egress mismatch in Promptfoo:** the disable flag still permits its one-time
   telemetry-disabled event path to attempt an HTTP request. The OS denied it.
   Import alone made no observed request. No vendor internals were patched. Flags
   are not a sufficient offline/security boundary for an eventual integration.
2. **Cancellation differs:** Braintrust can return from `Eval` while callbacks
   continue. Our first adapter lost scores, including a race where a scorer was
   scheduled after an abort-ignoring target finished. The adapter now waits for
   owned active callbacks and refuses new scorer execution after cancellation.
   Completed target output without completed scoring is `unscored`, not failed
   execution or a quality score. Promptfoo can still visit queued provider slots;
   the adapter blocks new target/scorer calls. Neither path kills arbitrary
   external effects. A hung callback remains a limitation; the outer proof process
   has a bounded deadline, not durable cancellation or recovery.
3. **Result shape differs:** Promptfoo's assertion summary requires numeric
   placeholders for failed/unscored assertions. The Drawloom-facing record keeps
   the actual finding/error instead; its native aggregate is not an authoritative
   Drawloom quality score. Braintrust supports null scores, with its default
   error-to-zero handler explicitly disabled. Both adapters need local callback
   correlation; neither is a zero-glue drop-in replacement.
4. **Our initial projection bugs:** duplicate IDs mixed results; final-batch timing
   overstated early-case time; active scorer cancellation lost findings. An
   independent Astra review reproduced them under network denial. Targeted fixes
   and retained regression checks followed. A further regression caught counting
   a cancelled native scorer slot as an actual scorer call; that counter now
   advances only when the supplied scorer is called.
5. **Type declarations:** checking Promptfoo's transitive Drizzle declarations
   under Drawloom's full strict library check failed on missing optional database
   modules and incompatible declarations. The Node proof has a separate strict
   source check with `skipLibCheck` for vendor declarations, following the existing
   Temporal proof pattern. The portable contract and all supported code retain
   their existing checks. This is an integration cost, not a vendor patch or proof
   that those declarations pass.
6. **Local is configuration-specific:** Braintrust `noSendLogs` passed for local
   data and deterministic scorers in a clean process. Remote datasets, enclosing
   traces and default model scorers are not covered. Both SDKs emit console
   summaries/errors; raw process logs stay temporary, outside public evidence and
   content-free operational telemetry.

The adapters remain similarly small, roughly 100 lines each plus shared parsing,
scorer composition and result projection. No production package imports them.
The candidate accepts one target configuration per run; a comparison uses
separately identified runs. Richer configuration matrices and incremental finished
case delivery remain review items rather than new framework machinery here.

## Final verification

- Real network-denied Node integration: both adapters passed 39 identical checks,
  followed by 30 warm repetitions. No hosted account or live model was used.
- Portable/schema, JSON persistence, isolation and measurement tests: 7 passed,
  27 assertions. OS-only tests explicitly skip on other systems; the real vendor
  launcher refuses unsupported isolation environments rather than silently running.
- `bun install --frozen-lockfile` and the canonical `bun run check:ci` completed
  successfully. After the final narrow cancellation, comparison and measurement
  corrections, targeted proof tests, strict type checks, dependency/UI guards and
  whitespace checks were rerun rather than repeating the entire application gate.
- The desktop build reported the existing large-chunk advisory; no UI was changed.

This sprint reached a useful review point before its one-hour checkpoint. Keep
the ADR Proposed and changes uncommitted; do not spend the remaining time building
a replacement vendor scheduler or widening the public plugin boundary.

## Acceptance still outstanding

At the end of this first sprint, real video checks, approved passage editing,
frozen knowledge comparisons, live Codex scoring and existing-shell/MCP Apps
presentation remained later review gates. The subsequent
[media-consumer sprint](adr-0025-media-consumers.md) records the video work;
the other gates remain outstanding.
A scripted judge demonstrates interface behavior, not judging accuracy. No scores
grant permissions, accept business output or switch a model automatically.
