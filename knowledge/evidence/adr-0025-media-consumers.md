---
type: source
id: adr-0025-media-consumers
title: Existing-media evaluation consumers
status: active
created: 2026-09-13
updated: 2026-09-13
---

# Existing-media evaluation consumers

Second sprint under [Proposed ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
The [first comparison](adr-0025-evaluation.md) remains the authority for vendor
selection evidence and its 30-run overhead measurements. This sprint tests the
recommended Braintrust adapter against media consumers. It does not adopt a
supported backend or accept the ADR.

Started 13 September 2026 at 02:01 UTC, with a one-hour review point and two-hour
stop. The [sprint plan](../../docs/plans/adr-0025-video-sprint.md) fixes scope.
Public fixtures are independently generated. Private media, criteria, code and
detailed results stay in the private workbench repository.

## Public contrasting consumer

The [PCM preview scorer](../../spikes/adr-0025-evaluation/audio-delivery.ts) uses
the unchanged candidate Scorer interface and existing Node asset reader. It
checks an independently specified sample rate, duration and peak range for a
short podcast preview. These are consumer criteria, not universal audio quality.

Four generated fixtures are stored **before** assessment: suitable audio,
overdriven audio, a short passage and silence. Findings score 1, 0, 0 and 0.
The scorer streams the stored bytes and closes its reader; it never regenerates
the audio. A reference must be both selected and permitted. Revoking permission
produces a scorer error without opening the asset, not a quality score of zero.
Malformed and interrupted reads also close their handles.

The real Braintrust runner executes under the existing macOS network-denied
launcher, with isolated configuration and no credentials. No network attempts
were observed. Results and attributed feedback reload from JSON. All four source
hashes remain unchanged. No target runs and no model is called.

### One-run measurement

Recorded on the first comparison's reference Mac, Node 24.20.0, with the same
pinned Braintrust 3.32.0 and Autoevals 0.3.0 dependencies. This consumer uses its
own technical scorer; actual Autoevals deterministic invocation was established
in the first sprint. A dependency import is not another scorer invocation.

| Observation | Result |
| --- | ---: |
| Four-case assessment wall time | 11.89 ms |
| Assessment process CPU, user / system | 16.39 / 3.27 ms |
| Whole-process peak RSS | 144.38 MiB |
| Bytes delivered to scorer | 112,176 |
| Readers opened / closed | 4 / 4 |
| Target / scorer calls in main assessment | 0 / 4 |
| Additional denied scorer invocation | 1; zero file opens |

Wall/CPU timing covers the first assessment only. RSS includes imports, fixture
preparation, access-denial verification and result reload. Read bytes are logical
reader output, not physical disk traffic. Source hashing performs additional
reads outside this counter. The runner's peak-concurrency counter measures
**target** callbacks and is zero for assess-existing; it does not mean scorers
never overlap. One sample is a functional observation, not a latency benchmark.
The [measurement record](adr-0025-audio-consumer.json) retains counters, checks
and source hashes without temporary paths or raw media.

Reproduce with `node spikes/adr-0025-evaluation/audio-proof.mjs`. The printed
temporary directory contains machine-readable findings and execution logs.
Canonical tests include three audio checks with 15 assertions. The first two
were observed failing against the initial stub before implementation; the
third adds regression coverage for reader cleanup.

Limitations: canonical mono PCM16 only, a consumer-specific 1 MiB ceiling, no
general WAV decoder, intelligibility, voice quality or large-media performance
claim. The explicit permitted-key callback proves access gating at this seam,
not the complete production authorization composition.

## Private video consumer

The private consumer used retained masters and independently specified delivery
criteria from the recipe/media implementation. It inspected stream properties,
checked timing against separately retained narration evidence and fully decoded
the selected audio/video streams. Existing masters passed these technical checks;
a deliberately wrong delivery requirement failed at the expected check.

The real network-denied Braintrust assessment made zero target calls. An
unpermitted reference stopped before inspection. Source hashes matched before
and after assessment; results and attributed feedback reloaded. Detailed media
facts, paths, hashes, timings and private criteria are deliberately not reproduced
here. The report belongs in
`drawloom-workbenches/docs/adr-0025-video-evaluation.md`.

This is a private consumer of the unreleased proof, not yet an installed
evaluation feature in the workbench UI. It establishes technical assessment,
not visual, editorial, listening, clinical or business quality. Full decoding
dominates this workload; tiny document-runner overhead does not predict it.
The private canonical gate passed, including the isolated real-run proof.
Focused review confirmed the final source hashes match the recorded evidence
and closed the inspector finding. No important review finding remains for this
bounded sprint; that is not production acceptance.

Review found that container-reported duration had initially been used where
the existing media implementation measures decoded audio samples. That is a
material distinction for compressed audio padding. The correction reuses the
existing inspector, keeping independent decode/delivery checks. It needs no
evaluation contract extension. Earlier measurements are historical, not proof
of the revised sample-based checks.

The final private scope deliberately reports two gaps: codec-name validation is
not repeated because the reused inspector does not expose it, and interrupted
media-process cleanup has not been proved. The retained inventory is not a
substitute for a fresh codec finding. Media-child CPU/memory also remains
unmeasured; the private process measurements cover the Node worker only.

## Decision and remaining work

No candidate contract change has been required by either media consumer.
Comparing source hashes with the first sprint confirms its contracts, adapters
and conformance code are unchanged; only its Node proof file list was extended.
Authorised media preparation and domain checks fit behind a scorer. This remains
a retained experiment, not a supported evaluation service or UI integration.
Native tool effects, frozen knowledge comparisons, live Codex judgement and
existing-shell/MCP Apps presentation remain subsequent gates.

The sprint reached its review point at approximately 02:31 UTC, within its first
hour. The recommendation is to continue with these candidate boundaries and the
Braintrust proof adapter for the next consumer gate. Do not promote either to a
supported implementation or infer broader judgement quality from delivery checks.

## Public verification

Frozen installation made no dependency changes. The canonical `bun run check:ci`
passed: 836 Bun tests passed, six skipped and none failed; the Node suites also
passed. Svelte checking reported zero errors/warnings. The existing desktop
large-chunk advisory remains; no UI or supported package was changed.
Focused review confirmed the public consumer's declared scope. It identified a
weak pre-cancellation test; the test now supplies an otherwise valid reference
so rejection cannot be explained by missing evidence. The three targeted tests
passed again after that test-only correction; the application gate was not
needlessly repeated.
