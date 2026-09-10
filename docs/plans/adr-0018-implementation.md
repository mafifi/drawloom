# ADR 0018 implementation

Status: completed through the [completion plan](adr-0018-completion.md).
ADR 0018 was accepted on 2026-09-10. This document preserves the original delivery
plan; current contracts and limitations live in the ADR and its evidence record.

## Outcome and constraints

Implement Agent Plugins 1.0.0 loading in public Drawloom and migrate the existing
private video workbench. Standard skills/MCP packages need no Drawloom extension.
Enhanced packages may declare a trusted backend under `io.github.mafifi.drawloom`.
UI communication stays MCP Apps. No proprietary code, prompts or fixtures enter
the public repository. No marketplace, hot replacement, paid media generation,
model downloads, production changes or new browser capability bridge.

Support stdio and Streamable HTTP, OAuth through the upstream SDK, OS credential
storage with explicit session-only fallback, native Codex-owned login, component
failure isolation and separate trust/grants/approval. Preserve source identities,
history media caching, existing projects and independent tool evidence.

Reusable private media/narration/brand/Veo packages use configured local files and
standard resources; the treatment backend owns business policy and selection.
Use prebuilt backend JavaScript and compiled Svelte HTML, testing package outputs
outside the checkout. Temporal remains a retained orchestration proof only.

## Ordered slices

1. Amend ADR/contracts; implement package inspection, isolated connection runtime
   and public conformance. Add failing tests before implementation.
2. OAuth, credential persistence and callback protections using MCP SDK; test
   controlled authorization, denial, refresh, restart and isolation.
3. Trusted backend loading, registry/tool projection, native login and existing
   desktop Plugins UI. Preserve review/grants/app-only authority.
4. Migrate private evidence, media, narration, brand, Veo and treatment packages;
   refresh public dependency snapshots and verify a generic MCP client.
5. Browser/private end-to-end, retained orchestration package-entrypoint proof,
   both canonical gates, evidence and reference updates.

## Acceptance

Standard packages load without host code; inspection executes nothing; malformed
components and duplicate names are isolated; missing dependencies disable only
dependent enhancements. Test local/HTTP connections and complete OAuth lifecycle,
credential confinement, stale callbacks and no retry of uncertain effects.
Verify real FFmpeg, scripted narration/Veo, passage review denial/approval, direct
Save without AI, restart preservation and cached resources. Check both themes,
keyboard interactions and public-only conformance. Record simulated versus live
results accurately. No acceptance claim before maintainer review.

The original implementation was held uncommitted for review. The completion
plan records subsequent acceptance and local-commit authorisation. OAuth metadata
publication remains separately scoped; journal content and private material
remain unchanged.

## Approved continuation: standalone consent and standard elicitation

The standalone Veo migration needs an explicit authority decision. Its existing
trusted in-process policy atomically binds human review, exact request/frame
bytes, price/route, allowance revision and reservation before submission. The
standard tool connection does not transfer that authority; model-supplied approval
arguments would weaken it. A backend wrapper alone is insufficient while the
underlying submission tool is directly callable.

The maintainer approved independent Veo spend consent and accounting, separate
from treatment business acceptance. Implement standard MCP elicitation and its
host presentation/lifetime support; keep native review and tool grants independent.
No Drawloom wire extension, approval flag supplied by the model, or shared spending
framework is authorized. Revalidate the exact request and allowance before
reservation; uncertainty must never automatically resubmit. Prove the package
with a generic MCP client and Drawloom. Stop for joint design if a non-standard
interface is required. Preserve the protected composition until replacement proof
passes; do not claim full migration before that evidence exists.
