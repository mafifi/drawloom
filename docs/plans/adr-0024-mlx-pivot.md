# ADR 0024 MLX pivot

Status: Completed after maintainer-authorized recovery fix. Implementation, live
setup, real inference, scoped review and final repository gate passed; delivered
with the cohesive ADR 0024 change. Verification is documented in the
[evidence](../../knowledge/evidence/adr-0024-mlx-acceleration.md#final-review-status).
User-authorised completion of the uncommitted ADR 0024.

## Global constraints

Work in the existing checkout; preserve other ADR 0024 changes. Do not commit or
push from implementation agents. No hidden model/runtime downloads, hosted
fallback, private data, global package changes or supported imports from spikes.
Use the existing embedding contract and root-owned dependency versions. Keep
historical ONNX evidence, but remove the CPU implementation and compatibility paths
as explicitly requested by the maintainer. Public CI must
not require models or Apple hardware. No subagents from implementers.

### Task 1: Supported MLX provider and consented setup

Own `packages/knowledge/local-embeddings/` and its provider tests only. Add a
supported persistent Python/MLX subprocess worker through the existing Node
provider interface. Remove ONNX workers and CPU model setup/choices; retain only
their historical measurement artifacts. Use `qwen3-embedding-0.6b-mlx` as the model identity.
The provider validates requests/results, enforces bounds, cancellation, timeouts,
one active request, offline inference, GPU availability, clean process shutdown
and a distinct indexing fingerprint. No network listener or server framework.

Reuse the measured MLX API/format from the retained experiment as evidence, not
an import or copied provider implementation. Model is
`mlx-community/Qwen3-Embedding-0.6B-8bit` revision
`407ad2329cd30702720aafe83f74a1ba30fdfbca`. Preserve the Qwen query prefix,
last-token pooling, normalization, 2048 per-sequence/8192 batch token limits.
Independently verify exact model artifact hashes from the existing download at
`/private/tmp/drawloom-qwen-mlx.WmoWH8/model` and pin the required files.

Extend the existing model setup interface before implementation to also install
an isolated runtime beneath its supplied model root after explicit consent. Use
an available uv executable, pin Python 3.12.13 and the tested runtime versions
mlx-embeddings 0.1.0, mlx 0.32.2, transformers 5.17.0, tokenizers 0.23.2.
Use a checked-in transitive lock with hashes, generated from package metadata,
not a runtime unbounded dependency resolution. Never modify global Python.
Missing uv/unsupported hardware must produce actionable status before download;
do not download or install uv globally. Runtime and weights are downloaded on
the user's machine, not bundled in Drawloom. Show runtime installation separately
from model progress; readiness means both verified. Retain GPL runtime attribution,
do not claim independent download changes the dependency's licence.

Use the existing `ModelSetup` facade and the MLX worker's minimal common
structural interfaces so composition can select MLX without duplicating storage
or the knowledge embedding adapter. Keep provider-specific launch controls local.
Do not run real downloads in tests. Add focused failing tests for consent,
cancel/failure/restart setup, subprocess lifecycle, malformed/oversized responses,
configuration mismatch and existing shared embedding conformance. Run targeted
package tests/typechecks. Report exact API changes and test evidence.

### Task 2: Local composition and Settings integration

Own local-knowledge-runtime, desktop knowledge presentation/host tests and
knowledge packaging scripts; update the existing evaluation composition's model
selection to exercise the supported MLX worker rather than only its proof injector.
Remove runnable CPU evaluation paths and stale launch instructions. Keep historical
report files and readers where useful, clearly distinguished from current model
support. Current comparisons are text-only versus MLX; do not rerun answer models
or change the frozen corpus simply for this pivot.
Select MLX Qwen as the only embedding backend; remove CPU choices and compatibility
routes. Do not relabel stored vectors or reset authoritative knowledge. Expose the
MLX choice and full runtime/model setup from the existing Knowledge settings.
Include a clear entry from the main Settings screen to those settings, without
duplicating the installer or its state in a second component.
Explicit Download and install action installs under the selected data directory;
show licence, size, location, prerequisite errors, progress, cancel/retry and ready.
Keep lexical search usable when MLX is unavailable, including non-Apple hosts.
Do not add CPU or hosted inference fallback. Do not reset databases/models.
Preserve the existing index-rebuild-and-switch behavior.

Use the existing ViewModel and shared controls with the microinteraction/Svelte
skills. Cover the real command-to-setup path, duplicate/cancel/retry states and
packaging outside the checkout. Keep Python script/runtime lock present in staged
application code, but no weights or Python environment bundled. Run focused
integration, UI-policy and type checks.

### Task 3: Evidence, review and cohesive commit

Controller owns ADR, architecture/reference updates and live verification. Record
oMLX comparison: inspected embedding engine uses mlx-embeddings; generation KV
caching is not demonstrated embedding acceleration. Choose the measured narrow
worker now, leaving server substitution possible through the same contract.
Verify real Settings setup and inference, offline restart, cancellation/errors,
light/dark UI and canonical gate. Record the accepted measured costs, synthetic
quality limits and remaining original ADR 0024 gaps without inflating claims.
Review changes before producing one cohesive ADR 0024 commit; no push requested.
