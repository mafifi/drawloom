---
type: evidence
id: adr-0018-plugin-standards
title: Standard plugin loading and backend capability boundary
status: active
created: 2026-09-10
updated: 2026-09-10
---

# ADR 0018: implementation and retained proof evidence

## Approved completion cutover — verified and accepted, 2026-09-10

The completion slice removes the legacy composition environment route and nested
backend wrapper. Enhanced packages now return contributions, controllers, named
MCP connections and cleanup directly. Declared optional tool/skill dependencies
produce a startup availability report; required dependencies still gate backend
import. Backend JSON keys are scoped by installation through the existing store.
This is collision prevention, not confinement of trusted code.

Preconfigured OAuth registration now reaches the desktop connection owner through
an explicitly selected host-side JSON file. The browser sends its path, not client
credentials. Tests reject symlinks, directories, oversized and malformed files;
registration uses the existing OS-store/session-only path. Disconnect removes
stored registration and tokens. No actual provider sign-in was performed here.

The final canonical public gate passed **495 tests, five opt-in skips, zero failures and
2,440 assertions**, plus Node conformance, desktop build, strict types and
dependency/UI-policy checks. The retained enhanced-entrypoint orchestration test
separately passed one test with seven assertions; it uses the deterministic proof
provider, not a desktop Temporal engine.

Review found a backend could collide with the built-in text workbench and prevent
startup. A failing-first regression now verifies rejection of that enhancement
while preserving its standard skills. Scoped re-review found the issue resolved.
Repeated in-process Bun fixture builds also produced EISDIR/SIGKILL failures;
building the media fixture in a separate Bun process made the reproduced six-test
sequence pass. This is test-build isolation, not a runtime recovery mechanism.

Public browser checks passed in light/dark at 1280px and dark at 390px: keyboard
inspection, deferred activation, default distrust, component selection, visible
errors and preconfigured registration controls. OAuth presentation responses were
controlled fixtures covering connect, cancel, denial, refresh failure, reconnect
and disconnect; these are not live authentication evidence. No page errors or
document overflow were observed. Screenshots are local verification artifacts,
not journal publication.

The private installed-workbench walkthrough and canonical gate are recorded only
in their owning repository. The gate passed 96 tests with 634 assertions. The
actual installed desktop exercised live native approval, denial and independent
grant refusal, direct MCP App editing without a model turn, persisted revisions,
cached resources and restart. Controlled media/provider proofs are separate from
those live observations; no paid generation or model download was performed.
Independent review findings were fixed and scoped re-review passed.

Final presentation checks also cover friendly tool titles/origins in Settings
without changing grant identities. A cold native catalogue probe exposed a
failure-isolation problem: local entries waited on slow optional provider
metadata. The host now applies an eight-second display deadline, retaining local
contributions and explicit native error categories. The live fallback returned
in 8,006 ms; it does not claim the full native catalogue was fetched. Focused
timeout/rejection/late-result tests and scoped review passed. No new capability
or MCP Apps browser protocol was added.

The maintainer accepted ADR 0018 and authorised local commits on 2026-09-10.
Logging, observability and instrumentation are the selected next ADR topic;
the eight-second fallback is not a resolved performance claim. See the ADR's
follow-up for the measured limit and outstanding diagnosis. No existing runtime
data was deleted; fresh disposable installations were used and test hosts stopped.

## Earlier supported implementation milestones (historical), 2026-09-10

The approved implementation now has supported package metadata/inspection,
stdio and Streamable HTTP connections, backend-entrypoint loading and a portable
orchestration contract. Desktop package integration and private migration are
still being verified. ADR 0018 remains Proposed; earlier proof results below are
not a claim that the full migration has passed.

An interim canonical `bun run check:ci` completed successfully: 471 tests passed,
five opt-in tests skipped, 2,349 assertions, plus Node conformance, strict types,
desktop build and dependency/UI guards. `bun install --frozen-lockfile` then
completed without changes. Subsequent delivery-gap work needs a final rerun;
this result is not final acceptance of the full private migration.

Observed focused results during implementation:

- Package inspection/schema/startup tests initially totalled 17 passing tests.
  Runtime coverage subsequently expanded to eight passing tests, including real
  subprocess/loopback HTTP initialization, overlapping cleanup, server isolation,
  header origin restrictions and no automatic retry of unauthorized tool calls.
- OAuth tests: 17 passed with 178 assertions after review corrections. These use
  actual SDK authorization code, registration and refresh functions with controlled
  synthetic responses, not a live third-party provider. Cancellation during delayed
  credential reads/refresh and preservation of registered client authentication
  methods failed before correction and passed afterward.
- Credential tests include an explicitly run macOS OS-store exercise with a random
  synthetic entry. The entry was deleted. Session-only fallback is tested; no
  plaintext credential files are used.
- Backend cleanup tests: three passed, including a synchronous disposer exception
  that must not skip another backend. Retained orchestration plus portable contract
  checks: ten passed. No Temporal code was promoted to supported packages.
- Initial desktop integration focused checks: 12 passed with 68 assertions across
  installation, projection, package composition, discovery and server tests. These
  are interim results; subsequent review found six ownership/dependency/reconnect
  issues, now corrected with 11 failing-first regressions. Bounded re-review found
  no remaining issues in those corrections (41 focused tests passed, one OS-store
  opt-in skipped; separate actual OS-store evidence is above).
- Native Codex discovery/sign-in transport fixtures: 14 passed with 53 assertions.
  The installed Codex 0.153.4 generated schemas confirmed login parameters
  `name`, optional `threadId` and the returned `authorizationUrl`. No live model
  or native OAuth login was invoked for these checks.
- Native sign-in plus desktop ViewModel checks: 53 passed, 234 assertions, including
  refusal of invented selections and discarding a late sign-in URL after navigation.
- Standard package resource discovery/composition: 14 passed, 57 assertions. Listed
  resources are cached and source-bound; upstream invalidation rejects stale
  receipts and in-flight stale metadata. Discovery invokes no tools.
- Resource review corrections and canonical backend dependency references:
  23 focused tests passed. Reads filter returned URIs and reject invalidation
  during the read; capture identity includes package resource revision while an
  unchanged revision reuses cached bytes across reconnect. Workbench tool/skill
  references resolve to actual registered aliases without losing grant/evidence
  identity. Bounded re-review found no remaining issues in those corrections.
- Disposable browser verification passed light/dark at 1280px and dark at 390px:
  keyboard inspection, inactive installation, deferred activation, no backend
  trust by default, visible missing-path failure and zero page errors. The three
  screenshots were visually inspected. Controlled browser responses also exercised
  Connect, Cancel, denial, refresh failure, restart-required reconnect, Disconnect
  and session-only messaging in all three layouts. These are presentation tests,
  not real sign-ins or the migrated private workbench walkthrough.
- The same browser checks were repeated against `browser-host.ts`, which bundles
  a valid public-notes standard MCP server outside the checkout and starts it in
  the actual desktop. Initialization reported connected/ready. Its resource
  catalogue appeared, and per-server deselection remained pending until restart.
  No backend extension, tool invocation or live model was needed for discovery.

Strict MCP SDK 1.30.0 declarations disagreed about optional `sessionId` under
exact optional-property checking. A retained Bun patch corrects that declaration
in both module formats. It changes no runtime behavior and does not weaken the
repository's compiler settings. OAuth OS storage adds pinned optional
`@napi-rs/keyring` 2.0.0; unavailable hosts visibly use session-only credentials.

### Approved metadata publication

Only `publishing/site/public/oauth/client.json` was published in remote commit
`e8394bff0c944e0318a51ffdce8695b1c71637ac`. The
[publishing run](https://github.com/mafifi/drawloom/actions/runs/34488986726)
completed build and deployment successfully. An HTTPS read of
[the deployed metadata](https://mafifi.github.io/drawloom/oauth/client.json)
returned the expected public-client identity, no secret, and portless loopback
`http://127.0.0.1/oauth/callback` redirect registration. The actual callback uses
the running host's bound port.

The narrow remote commit did not push the seven earlier local commits or the
current implementation. Local and remote history therefore need normal integration
before a later push; do not overwrite the remote metadata commit. Journal sources
and private material were not published.

The retained enhanced entrypoint proof bundles a synthetic backend outside the
checkout, inspects it through the supported loader and injects the accepted
orchestration interface. Its MCP App invokes an idempotent arithmetic workflow:
one test passed with seven assertions and one actual task execution. This uses
the deterministic test engine, not a desktop Temporal provider or live model.

Remaining: finish public delivery-gap verification, private standard package and
treatment-workbench migration, generic-client and migrated browser/restart
evidence, and both final canonical gates. No full Agent Plugins certification or
universal OAuth/provider compatibility is claimed.

## Standard form elicitation continuation

Public package connections now negotiate standard form elicitation when a host
presenter is available. Focused transport, installed-package/gateway, presenter,
typed-form and ViewModel checks passed **75 tests / 342 assertions**. Actual
stdio and Streamable HTTP connections were exercised; missing grants produced
zero protected calls and zero forms. Controlled responses verified separate
accept/decline/cancel actions and cancellation/stale-response isolation.

Browser presentation checks passed light and dark at 1280px and dark at 390px,
with typed scalar and multiple-choice answers, all three response actions, no
page errors and no document overflow. These are public synthetic presentation
fixtures, not private provider or live model evidence.

Review identified and corrected a reconnect-status propagation defect: the
desktop now observes the replacement connection's live status rather than a
copied connected value. Its real HTTP reconnect/pending-form/cancellation
regression failed before the correction and passed afterward. Scoped re-review
found the issue resolved without new blocking findings.

The subsequent combined public gate passed **487 tests, five opt-in skips, zero
failures and 2,415 assertions**, plus Node conformance and the canonical build,
type and policy checks. Frozen installation and diff whitespace checks also
passed. The gate does not establish completion of ADR 0018 or the private migration.

The per-connection serialization, five-minute total deadline and explicitly
unsupported elicitation modes are recorded in ADR 0018. No proprietary MCP
wire field, additional reviewer or automatic business acceptance was added.

## Original retained experiment (historical)

The [retained proof](../../spikes/adr-0018-plugin-standards/README.md) exercises
the [proposed decision](../../docs/adr/0018-plugin-standards-and-runtime-extensions.md).
It does not accept a complete packaging contract or migrate the desktop runtime.
Private consumer changes and tests are recorded only in their owning repository.

### What ran before supported implementation

On 2026-09-10, Bun 1.2.23 ran 10 tests with 43 expectations and zero failures
(557 ms in the initial combined pass). Discovery first failed in six cases against
an unimplemented loader; process activation and backend control each failed against
their unimplemented entrypoint before implementation. Negative validation tests
were not all independently mutation-tested.

- A package without Drawloom metadata or a package version was discovered.
  A non-SemVer version was also preserved. Unknown fields produced diagnostics;
  an unrecognised extension was not executed.
- One skill and its supporting reference remained readable without injecting its
  body into the discovery result. Invalid siblings and escaping paths were rejected.
- A real Node MCP subprocess exposed tools from `mcp.json`. The deliberately
  unavailable sibling did not stop it. Discovery created no runtime files.
- Its counter changed from 0 to 3, survived reconnect to the same instance data,
  and remained 0 in a second instance. Client-controlled plugin variables overrode
  a conflicting package environment value.
- An MCP Apps resource from that subprocess passed through the **existing**
  desktop host and standard App bridge, without a Drawloom plugin factory. Its
  opening tool returned counter 0 and an invented tool call was refused.
- A separate trusted backend control used the ADR 0017 orchestration contract:
  input 4 produced output 8; duplicate request identity executed the task once.
  An absent orchestration capability returned an explicit tool error with zero
  task calls. The App could not call an invented `orchestration.start` tool and
  received no orchestration capability through host initialization.

This last case uses ADR 0017's ephemeral test provider, not Temporal or live Codex.
It verifies backend-first composition, not restart durability or a new security
sandbox. Tests use the real MCP SDK; no browser screenshot proof was performed.

Final public verification on 2026-09-10: frozen install and `bun run check:ci`
passed, including 405 Bun tests, four opt-in live approval skips, zero failures
and 1,957 expectations. Node shared conformance, strict types, UI policy and
dependency/import guards passed. The existing 574 kB desktop chunk warning remains.
Local documentation links and `git diff --check` passed. No commit or publication
was requested for this proof slice.

### Boundary missing in the original experiment

The standard subprocess receives portable launch configuration and an MCP
connection. The trusted backend control receives an actual TypeScript interface
from composition. These are not the same mechanism, and this proof does not
pretend that a manifest declaration makes the second available to the first.

To combine them, Drawloom needs an explicitly approved capability connection for
the plugin backend, or a trusted runtime entrypoint. The current proof implements
neither. UI communication need not change: the App already calls its own backend
through standard MCP Apps. No direct browser orchestration/memory API is needed
by either exercised interaction.

The standard-only path is useful independently. Do not require every plugin to
adopt whichever Drawloom extension is eventually selected. Do not infer a generic
memory API from the architecture map: its contract has not been established.

## Reference freshness and limits

Read the normative [Agent Plugins specification](https://agent-plugins.org/specification)
and linked loader/runtime rules before expanding the proof. This implementation
is a bounded stdio slice, not full conformance. Remote transports, authentication,
complete skill-format validation, launch deadlines and installation/update policy
remain unproved. Preserving data through process restart is not an update migration test.

DeepSeek's current local checkout remains at
`b2e3b2a0125854567a4a5fcba75782e42fe84901`; its typed tool dependency injection
was reinspected. Rosalind 0.2.5-research-preview still uses resource-linked MCP UI
and OpenAI-specific entrypoint metadata in the inspected server. Neither reference
was executed or established as Agent Plugins-conformant. The
[survey](../../docs/reference/harness-workbench-survey/README.md) and
[Rosalind evidence](../../docs/reference/mcp-apps-host-evidence.md) retain their
broader scope and limits.
