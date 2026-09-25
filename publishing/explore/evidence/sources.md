# Sources for publishing/explore/evidence/page.md

Unpublished verification notes. Paths are relative to the repository root.

## How the checking works

| Claim | Source |
| --- | --- |
| Each part has an interface with a shared conformance suite; every implementation runs it | docs/adr/0004-standardise-capability-contracts.md, "One shared conformance suite ships with each contract"; CONTRIBUTING.md, "Test the behaviour, not just the code"; ARCHITECTURE.md, "Interfaces and tests" |
| Code is not called conforming until the shared suite runs against it | ADR 0004, bold sentence in the same section |
| The same agent suite runs against the synthetic agent and the Codex adapter, using a simulated connection | scripts/test-packages-node.mjs lines 51-52; scripts/agent-conformance-fixtures.mjs (`codexAgentFixture` uses a scripted RPC transport and local gateway) |
| Vitest resolves workspace source, which does not prove published exports work | CONTRIBUTING.md, "Test the platforms you claim to support" |
| Packages are packed and advertised exports are checked inside the tarball | scripts/check-package-artifacts.ts |
| Built packages are installed into a disposable folder and run from there | scripts/test-replacement-packages.ts, header comment and mkdtemp |
| End-to-end runs include engine restarts and force-quit/reopen, checking for duplicates | knowledge/evidence/adr-0017-orchestration.md "Restart points and topology"; adr-0034-final-native-acceptance.md "Native pending-work recovery" |
| Automatic licence check on dependencies; separate check on files inside the Mac app | package.json `check:licenses`; scripts/check-bundled-licenses.ts header; apps/desktop/package.json `bundle:host` runs it; docs/plans/pre-publication-audit.md F8 row |
| The automated check cannot see every native component; inspect the distributed runtime | CONTRIBUTING.md, "What should I check and record?" |
| Developer ID signing, assembled-app acceptance, notarisation, clean test Mac | docs/reference/macos-release.md, "Commands and guarantees" and final paragraph |

## Automatic versus manual

| Claim | Source |
| --- | --- |
| CI runs on pull requests and pushes to main | .github/workflows/ci.yml `on:` |
| `check:ci` contents (format, docs, dependency policy, licences, builds, package artifacts, types, tests, Node tests, replacement consumers) | package.json `check:ci` |
| Separate real Temporal recovery job; synthetic browser acceptance | ci.yml jobs `learning-integration` and step "Verify public synthetic browser acceptance" |
| Public CI needs no private code or credentials | AGENTS.md "Public CI must work without private repositories, credentials or services"; CONTRIBUTING.md "Public and commercial boundary" |
| Signing/notarisation are deliberate local release gates, not public CI | docs/reference/macos-release.md, last line |
| No macOS CI job | adr-0034-notarised-release.md "Explicit remaining limits"; pre-publication-audit.md F9 |
| Live-model and credential tests are opt-in skips, not counted as passes | adr-0034-final-native-acceptance.md "Explicit remaining limits"; adr-0020-projects-file-delivery.md "Reproduction and limits" |

## Where the evidence lives

| Claim | Source |
| --- | --- |
| Records carry method, environment, results and limits, with dates | knowledge/evidence/README.md; knowledge/AGENTS.md (front matter dates, freshness) |
| Superseded records remain in history and link to replacements | knowledge/AGENTS.md |
| First release acceptance record retained after two later ones | adr-0034-release-acceptance.md "Current-status supersession" |
| Eight-second stopgap later removed; original stays as before record | adr-0018-plugin-standards.md (eight-second display deadline); discovery-latency-fix.md opening paragraph |
| Older records mention Bun; Node replaced it | e.g. adr-0021-local-temporal.md "Executed public verification"; ADR 0034 status; ARCHITECTURE.md "Language and toolchain" |

## Area sections

| Claim | Source |
| --- | --- |
| One tool connection, per-request permission | adr-0005-tool-exposure.md "Outcome" |
| Delayed and replayed request refused | adr-0008-tool-execution.md "Conclusion" |
| Binding relies on Codex-private fields, retest after upgrades; no crash recovery/exactly-once | adr-0008 "Source corroboration and limitations" items 1 and 4 |
| Codex Desktop declined form elicitation without UI | adr-0007-codex-app-server.md "Known limitations" item 1 |
| MCP Apps migration; implemented subset only | adr-0013-plugin-host-integration.md "MCP Apps migration" |
| Agent Plugins: bounded stdio slice, not full conformance | adr-0018 "Reference freshness and limits" |
| Settings checks; not a screen-reader audit | adr-0029-plugin-settings.md "Implementation checks" |
| Worker/service restart at input wait, same state, unchanged activity count | adr-0017 "Restart points and topology" |
| Whole-host restart; interrupted effects shown uncertain, no automatic second call | adr-0021 "Starting evidence and limits", "Recovery, authority and review corrections" |
| SQLite local server is development/testing only | adr-0021 "Starting evidence and limits" |
| Restarts at chosen points; no live-model reattachment | adr-0017 "What is not established"; adr-0021 recovery section |
| Memory sprints: capture, maintenance, recall, contrary evidence | adr-0022-memory-sprint.md "Outcome" |
| 10,000-record store; interruption recovery, vectors byte-identical | adr-0024-local-knowledge.md "Interrupted 100k stress and real embedding recovery" |
| 24 paired questions, one substantive improvement, no clear gain on semantic questions; maintainer kept hybrid | adr-0024 "Paired live answer evaluation" |
| 100k run stopped, not a pass | adr-0024 "Interrupted 100k..." and "Acceptance still to collect" |
| Four live learning runs; model wrongly said tool unavailable; no universal prompt-injection claim; Apple silicon and synthetic corpus | adr-0027-learning-journey.md "Fourth live run and accepted closeout" |
| Two real policy engines (Cedar, Casbin), failing cases first | adr-0023-authorization.md title and "Method and observed results" |
| Not NIST compliance or full AuthZEN conformance; inheritance rules not core | adr-0023 "Limits and decisions to bring back"; brief |
| Project work defects found and fixed, incl. OAuth disconnect | adr-0020 "Bugs found and corrected during verification" |
| Drawloom relies on agent sandbox; ambient tool isolation not tested | ARCHITECTURE.md "Sandbox"; adr-0022-memory-sprint.md "Boundaries and next review"; adr-0025-tools-and-codex-judge.md |
| Two libraries passed 39 checks; Braintrust less time and memory | adr-0025-evaluation.md "Comparative result" |
| Four live judge cases matched; explanations not fully reliable | adr-0025-tools-and-codex-judge.md "Live public judging" |
| Supported delivery accepted; no wider judgement quality; scores grant nothing | adr-0025-supported-evaluation.md "Scope and status"; adr-0025-evaluation.md "Acceptance still outstanding" |
| 0.698 ms median, ~26% on a very small operation | adr-0019-observability.md "Measured overhead" |
| 8,007 ms to 1.48 ms first catalogue read; single-run observations | discovery-latency-fix.md "Live read-only observation" |
| Browser queue loss and long-duration stress not measured | adr-0019 "Reference comparison, limits and decision" |
| Native recovery cases; scripted provider, not real Codex | adr-0034-final-native-acceptance.md "Native pending-work recovery" |
| First notarisation rejected (esbuild ad-hoc signature); second accepted, withdrawn over PATH; third accepted, Gatekeeper, clean Mac, state unchanged | adr-0034-notarised-release.md, all sections |
| Remaining: no conversations preserved; quarantined first launch and Dock-launched Codex conversation not yet run | adr-0034-notarised-release.md "Explicit remaining limits" |

## Not used or uncertain

- The pre-publication audit (line 553) still lists Developer ID signing and
  notarisation as outstanding; the later notarised-release record closes that.
  The page follows the dated evidence record and does not cite the audit's
  summary line.
- Test counts (for example 1,607 Vitest tests) were left out of the page because
  they change with every run.
