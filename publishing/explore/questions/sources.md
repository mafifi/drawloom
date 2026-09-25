# Sources for the Questions page

Verification notes, not published. Checked against the repository on 25 September 2026.

## Does it work in real use

- Previous installation held no projects or conversations; update proves state intact, not that real conversations survive: `knowledge/evidence/adr-0034-notarised-release.md`, "Explicit remaining limits", bullet 1.
- Not yet run from the clean Mac's desktop session: quarantined first launch, real Codex conversation from Dock-launched app, quit/relaunch with a conversation, keychain probe; SSH copies carry no quarantine attribute so skip Gatekeeper first-launch path: same section, bullet 2.
- Codex installed elsewhere (e.g. Node version manager) found only when started from a shell whose PATH contains it: same section, bullet 3.
- Signed app killed mid-task; no duplicate request/effect; unfinished effect shown as uncertain; used a deterministic stdio provider, "not a real Codex/model run": `knowledge/evidence/adr-0034-final-native-acceptance.md`, "Native pending-work recovery".
- Native Codex live-review/model lanes not run: same file, "Explicit remaining limits", bullet 2.
- Later record does not close these: the notarised release record (23 Sept) is the latest release evidence and lists them as remaining.

## Safety designed but not yet proven

- Interface modelled on NIST SP 800-162; proves neither NIST compliance nor full AuthZEN conformance: `docs/adr/0023-knowledge-memory-authorization-boundaries.md`, "Consequences"; `knowledge/evidence/adr-0023-authorization.md`, "Limits and decisions to bring back" bullets 1-2.
- Fixture inheritance rules not adopted by core; implementations or organisations supply rules: evidence limits bullet 4. "Acceptance of the authorization boundary is not proof of deployed enterprise policy": `AGENTS.md`, knowledge and memory area guide. ADR 0024 "Acceptance is not a claim that ... enterprise policy is deployed" (line ~221).
- Note: the experiment's "no supported package" bullet is superseded (packages/authorization/* now exist), so the page does not repeat it.
- Revocation does not erase previous disclosure; deletion, durable caches, indexes need lifecycle design: evidence limits bullet 5. ADR 0023 Consequences: cache invalidation and deletion remain explicit engineering work.
- Observability: overhead measured and diagnostic value demonstrated; browser queue loss before relay receipt not measured; no native Tauri/Rust IPC, full-machine restart or long-duration stress result claimed: `knowledge/evidence/adr-0019-observability.md`, "Reference comparison, limits and decision". Content-free diagnostics: `ARCHITECTURE.md` capability list (Observability).

## Knowledge and learning

- 10k paired evaluation: one substantive improvement (i3, identifier recall); no clear answer-level improvement across 11 semantic questions: `knowledge/evidence/adr-0024-local-knowledge.md`, "Paired live answer evaluation".
- Full 100k semantic run stopped for review rather than reported as passed; hybrid retained, broader value deferred: same file, "Acceptance still to collect".
- "Stronger representative workloads and production experience will assess whether semantic retrieval earns these costs": `docs/adr/0024-local-knowledge-memory-and-retrieval.md`, near line 212.
- Sufficiency abstention zero by design; admission floor filters wholly unrelated, not related-but-incomplete material; retrieval precision at scale unmeasured: `docs/plans/pre-publication-audit.md`, "Limits the delivery states rather than hides".
- Supported live judge distinguished faithful (1) from contradictory (0); 23,356 / 19,031 input tokens for tiny inputs; not broad judge calibration or proof that judging earns its cost: `knowledge/evidence/adr-0025-supported-evaluation.md`, "Supported live native judging". ADR 0025 lines 58-63: broader judgement calibration and production usefulness remain limitations.

## Platforms and providers

- Codex is currently the only supported agent integration; designed to work with different providers: `README.md`, "Principles".
- Provider-specific richness remains bounded until another provider or consumer earns a portable abstraction: `docs/adr/0007-provider-neutral-agent-execution.md`, "Consequences".
- Same conformance suite against every implementation: `AGENTS.md` non-negotiable rules (supports "passing the same tests").
- Preview needs Apple silicon Mac, macOS 14+: `README.md` lines 13-15.
- macOS arm64 build-host evidence only, not every OS version or architecture: `adr-0034-final-native-acceptance.md`, "Explicit remaining limits" bullet 4.
- Model-enabled acceptance Apple Silicon and Metal only: `pre-publication-audit.md`, "Limits the delivery states rather than hides".
- All CI jobs run on ubuntu-latest; no job builds, signs or verifies the .app; repair is a macOS job: audit F9; confirmed by `.github/workflows/ci.yml` and `publishing.yml` (all `runs-on: ubuntu-latest`). Notarised release record: "There is still no macOS CI job."

## Deliberately left out

- Notarisation / Developer ID signing: closed by `adr-0034-notarised-release.md` (the audit's final bullet listing them as outstanding is stale).
- F12 (A4, nothing interrupts real work): a pending approval at kill time is now exercised by the native recovery fixture in the final native acceptance record; the remaining gap (real Codex) is covered by the crash-recovery question instead.
- F4 (composition root size), F1b (domain vocabulary), F6 (doc loose ends): internal engineering items, not reader-facing open questions.
- Browser panel isolation (ADR 0033): final acceptance says its evidence lives in separate records; not reviewed here, so not claimed either way.
