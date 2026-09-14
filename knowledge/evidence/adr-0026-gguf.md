---
type: source
id: adr-0026-gguf
title: Permissive runtime replacement evidence
status: draft
created: 2026-09-14
updated: 2026-09-14
---

# ADR 0026 evidence

This record accompanies [Accepted ADR 0026](../../docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md).
The maintainer authorised acceptance on 2026-09-14. This evidence does not certify
release readiness or convert incomplete checks into passing results.

## Investigation: measured before implementation

Source: [llama.cpp 2f539596](https://github.com/ggml-org/llama.cpp/tree/2f539596c6e9a977e91b6bc6344650422c6bc3b0).
Model: [official Qwen GGUF](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/tree/370f27d7550e0def9b39c1f16d3fbaa13aa67728),
Q8_0, 639150592 bytes, SHA256
`06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439`.
Host: Apple M2 Ultra, arm64, macOS 26.6.2. Synthetic public inputs only.

The local static build links Apple/system frameworks and libraries only according
to `otool -L`; reviewed vendored components carry MIT/BSD/public-domain terms.
This is scoped build evidence, not clearance of arbitrary upstream distributions.

| Observation | Result |
| --- | --- |
| Metal layers | 29/29 offloaded |
| Readiness, warm filesystem | 614 ms |
| 30 varied short inputs median / p95 | 13.96 / 16.75 ms |
| Outputs through 2048 input tokens | finite, normalized, 1024 dimensions |
| Resident process after run | 1841248 KiB, approximately 1.76 GiB |
| Allocated Metal compute buffer | 1208.96 MiB |
| Missing API key | HTTP 401 |
| SIGTERM cleanup | exit 0 |

The initial 2048-context configuration rejected 2048-token inputs. The retest
used 4096 context and batch/microbatch 2048. The server also accepted 2049 tokens:
Drawloom must enforce its own 2048-token limit, not rely on the server context.
Warm input prefixes were varied after noticing cache reuse. The server's embedding
task initializes its own defaults rather than the general completion schema; flags
requesting disabled cache are not proof that caching was disabled. Long repeated
token tests may benefit from prefix reuse and their timings are not cold throughput.

An isolated MIT MLX-VLM smoke test worked, but its normal dependency closure includes
SciPy's GPL-with-exception GCC runtime libraries. It fails the chosen strict policy.
The GPL `mlx-embeddings` runtime was not executed for this investigation.

Raw local investigation files are retained in
`docs/reference/evidence/generated/llama-cpp-investigation/`; reviewed portable
results are recorded here. Those ignored scratch files are not assumed present in
a fresh checkout. Historical MLX evidence remains in its original evidence record.

## Upstream limits

- [Issue 27784](https://github.com/ggml-org/llama.cpp/issues/27784): long-input Metal
  NaNs and unnecessary LM-head computation. Open when inspected; not disproved by
  these bounded tests.
- [Issue 28357](https://github.com/ggml-org/llama.cpp/issues/28357): heap corruption
  reported with an older vendored snapshot. Do not present it as reproduced on the
  inspected revision or as fixed merely because a smoke test passed.

## Implementation verification

### Server boundary finding and approved correction

An additional real negative control found that the pinned server accepts
`POST /completion` with the private process key even when started with
`--embedding --pooling last --offline`: HTTP 200, one locally generated token.
The test used invented input, no hosted service and no paid generation. Drawloom's
worker exposes only tokenization/embedding calls and never forwards arbitrary
endpoints, but this is not an upstream server-level generation prohibition.
`evaluations/knowledge/gguf-endpoint-check.ts` reproduces the distinction.

This established that the original archive did **not** meet the strict embedding-only
requirement. The maintainer subsequently approved a narrowly scoped reproducible
upstream build patch rejecting generation endpoints. This corrects the server
rather than relaxing the boundary. The original negative control remains evidence;
the runtime archive is not approved for publication.

Implementation and comprehensive verification are in progress. The production
worker, using the already audited local build, completed the unchanged frozen
10,000-record corpus on the reference M2 Ultra:

| Measurement | GGUF observation |
| --- | --- |
| Indexing | 351,119 ms (about 28.5 records/second) |
| First hybrid search | 1,231 ms |
| 30 warm searches, median / p95 | 872 / 1,088 ms |
| Sampled peak child RSS | 1,270,235,136 bytes |
| Hybrid store including SQLite sidecars | 252,978,000 bytes |
| Relevant-evidence recall, lexical / hybrid | 0.926 / 1.000 |
| Exact-identifier recall, lexical / hybrid | 0.750 / 1.000 |
| Chain completeness, lexical / hybrid | 0.600 / 0.800 |
| Irrelevant-query abstention, both | 0.000 |

This meets the 2-second p95 target on this run, not a production-quality claim.
Precision was 0.120 lexical versus 0.113 hybrid; improved recall is not uniformly
better retrieval. No answering model was invoked. Indexing overlapped development
build/check activity and one small installation inference check; these timings
are observations, not isolated-machine benchmark ceilings. Prefix caching was
observed in server logs. Child RSS is sampled separately from host RSS and is not
additive with shared Metal allocations. The 100,000-record run was deliberately
interrupted after the server-boundary finding, pending maintainer direction.
Read-only Node SQLite inspection after shutdown found all 100,000 authoritative
records and 20,597 committed index-progress and embedding-entry rows. Both
evaluation processes exited. This is retained interruption evidence, **not** a
completed 100k indexing or warm-search result.
Raw reports and reproducible drivers are under
`docs/reference/evidence/generated/adr-0026/` and `evaluations/knowledge/gguf-local.ts`.

Local fixture delivery of the exact archive and official weights made two fetches,
none without consent, survived setup restart and produced two finite 1024-dimensional
vectors through the installed executable. Repeated after security fixes, this also
exercised the actual managed host: intake, indexing, hybrid search, then shutdown.
Exactly one installed embedding-server process was observed before client close;
none survived afterward. Settings was inspected in an
isolated real desktop host: unavailable publication is explained, the download
button is disabled, and text search remains accessible without Python/uv.

The initial broad Bun suite passed 1,021 tests, with 8 opt-in skips (4,949 assertions).
Desktop type checking reported no errors or warnings; package builds/export guards,
root type checking and UI policy passed. The expanded licence gate initially blocked
on MPL Lightning CSS. On 2026-09-14 the maintainer permitted reviewed MPL-2.0;
exact reviewed versions and source/notice obligations are recorded in
`LICENSES/MPL-REVIEW.md`. The rerun JavaScript licence gate reports zero blockers.
Cargo artifact mapping and missing legal-file collection remain separate release
tasks in `LICENSES/README.md`. Independent security review found
and then cleared five issues: intermediate-symlink cleanup, executable tampering
across restart, managed child-process shutdown, trusted setup propagation and
cleanup refusal feedback. The 100k stress proof remains a release requirement.

The 2026-09-14 acceptance-checkpoint canonical `bun run check:ci` completed with
exit code 0 after the MPL policy correction: 1,027 Bun tests passed, 8 opt-in tests
skipped, and the Node package checks passed. Focused MPL allow-list/closure tests
subsequently passed 8 tests and 28 assertions, including Linux variants, altered
licence text and unreviewed versions. The runtime patch receives separate final
verification below; this checkpoint does not substitute for that check.

Two complete clean builds produced the same 4,697,326-byte archive with SHA-256
`74c2efbdb08340e88b54917a5c8e142fffcfd11cee462ed0dd157e41040e1c65`.
The executable SHA-256 is
`84d7e82ec4dc3b166c72962ba2d06b5d7c157f89fbb93f3a874f6ef088b75fa6`.
This demonstrates repeatability on the recorded local toolchain, not cross-machine
reproducibility or signed/notarized distribution. The archive includes upstream
MIT and retained notices for compiled third-party code. Its manifest intentionally
has no public URL.
Runtime archive publication is not authorized by this work. Missing production
download availability remains a release blocker even when local installation tests
pass. Unrelated licence inventory findings are not implicitly waived or remediated.

## Accepted endpoint correction and final runtime

The approved tracked patch `scripts/patches/llama-server-embedding-only.patch`
replaces the pinned server's 12 generation/control/transcription handlers with
explicit `403 feature_disabled` responses. Tokenization, embeddings and health
retain their original handlers; authentication is unchanged. Source review also
checked that optional GCP aliases dispatch through those same restricted handlers.
The production worker does not enable that optional environment configuration.

The build applies the patch in a detached worktree, leaving the upstream checkout
unchanged. Staging uses a stable path to preserve reproducibility and embedded Git
revision metadata. Cleanup requires successful ownership of that worktree, avoiding
removal of another concurrent build's staging directory.

Two clean final builds produced byte-identical archives:

- Size: 4,697,890 bytes.
- Archive SHA-256: `0bf91c702d391a106aba0e0b61f15a5b77bab5d269aff0c7590b2f82332de88a`.
- Executable SHA-256: `e1e60e0d2dde29a6da46474f6ba1b8365f714527230bc4cb35134c3839096007`.

These replace the earlier unpatched pins above. The embedding fingerprint now
includes the runtime executable hash, so indexes built with a different runtime
are rebuilt rather than silently reused. The 10k timing table above measures the
earlier runtime; it is not represented as a rerun against this patched archive.

A fresh production installation through local fixture delivery verified both pins,
restart readiness, two real 1024-dimensional vectors, managed indexing/search and
shutdown from one child to zero. Live checks against this installation returned
403 for all 12 restricted routes while health, tokenization and embeddings passed.
The endpoint receipts and installation/shutdown receipts are retained under
`docs/reference/evidence/generated/adr-0026/`. No runtime download URL was invented,
no archive was published, and no model download was needed for this verification.

Final canonical `bun run check:ci` exited 0: 1,028 Bun tests passed, 8 opt-in skips,
and Node checks passed. After the test-only Linux platform-fixture correction,
the focused build/policy/provider suite passed 20 tests with 88 assertions.
Independent review cleared the endpoint routing and worktree-ownership fix;
the test now supplies deterministic platform detection rather than depending on
the machine running public CI.
