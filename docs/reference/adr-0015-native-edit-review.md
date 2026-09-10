# ADR 0015 implementation evidence

Verified 2026-09-09 against installed Codex **0.153.4**, Bun **1.2.23**, and the
existing public desktop plus private video plugin. No separate application,
reviewer or MCP Apps extension was introduced. See
[ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md).

## Public verification

`bun install --frozen-lockfile` and `bun run check:ci` passed: **319 tests,
1,625 assertions**, four explicitly opt-in live tests skipped by ordinary CI.
The gate also passed package exports, dependency barriers, TypeScript, Svelte,
UI/design policy, publishing checks and Node shared conformance. Svelte reported
zero errors/warnings; the existing large-client-chunk advisory remains.
Public tests do not import private code or require credentials.

Focused tests were written failing before implementation. They cover annotation
validation and MCP SDK discovery, human defaults/unsupported modes, precise
request identity, changed arguments, cross-session responses, terminal cleanup,
ordinary elicitation, native automatic-review status mapping and conversation
preference persistence. Review found and closed two further regressions with
failing tests: delayed signal delivery must not leave reviewer selection unlocked,
and a human turn or mismatched native phase must not be labelled automatic review.

The opt-in live test is
[`native-review.integration.test.ts`](../../apps/desktop/host/native-review.integration.test.ts).
Run with `DRAWLOOM_LIVE_NATIVE_REVIEW=1 bun test apps/desktop/host/native-review.integration.test.ts`.
It uses signed-in Codex and its account allowance, a disposable in-memory text
record, and the supported authenticated MCP gateway. No preview is supplied.
It allows tool discovery; the installed runtime did not initially offer the tool
to the model without discovery, despite listing it in thread-scoped MCP inventory.

| Live scenario | Observed result |
| --- | --- |
| Ask me, approve | One human request; handler count zero at request; approval followed by exactly one edit |
| Ask me, deny | One human request; zero handler calls; unchanged text; no retry |
| Approve for me | Native in-progress then approved notification with rationale **before** the one handler call; no human prompt |
| Revoke Drawloom grant before human approval | Native approval succeeded; gateway denied; zero handler calls and unchanged text |

All four live scenarios passed. Automatic-review **denial, timeout and cancellation
are deterministic transport evidence**, not observed live reviewer decisions.
Transport tests verify status/cleanup mapping; they are not a substitute for the
live approval-before-handler observation. Native review remains governed by Codex's
own policy, including its supported decision/reuse behaviour; no reviewer policy
or organisation requirement was changed.

## Existing private consumer

The private repository's canonical gate passed **69 tests, 484 assertions**, strict
TypeScript, Svelte (zero errors/warnings), dependency policy and standalone Svelte
MCP App build. Its public dependencies were refreshed through the established
content-addressed preparation workflow, followed by normal and frozen installs.
Private implementation detail and fixtures remain there; its evidence log is
`docs/adr-0015-edit-progress.md`. Public CI does not depend on this check.

Browser verification used the existing desktop at `http://127.0.0.1:4396/`, a
dedicated local proof data directory and the existing populated synthetic video
fixture. Only passage reading/editing grants remained enabled during live edits.
No production content, paid media, real narration or model download was used.

| Existing UI interaction | Observed state |
| --- | --- |
| Direct Save | Revision 1 → 2, unaccepted draft. Browser requests were the app-only Save and standard context refresh; no model message or AI approval |
| Restart after direct Save | Revision 2 text restored; original accepted/output-selected revision unchanged |
| Ask agent to revise, Ask me | Native approval displayed the exact target and replacement; approval created revision 3 as a draft |
| Ask agent to revise, Deny | No new revision; revision 3 remained inspected; agent stopped without retry |
| Ask agent to revise, Approve for me | Native progress and approval rationale displayed; revision 4 created as a draft without a human approval prompt |
| Restart after native edits | Four revisions retained; original revision 1 still accepted/output-selected; later revisions drafts; reviewer preference restored; no stale approval controls |

The flow was checked in light and dark at **1440×1000**, with a **390×844** narrow
layout check. Correct page identity, nonblank content, no framework overlay,
zero relevant browser console/page errors, and no root horizontal overflow were
observed. Screenshots remain outside source control: private consumer UI is not
copied into the public repository. Browser skill/plugin was not available in this
session; bundled Playwright used installed Chrome with no browser download.
Native Tauri packaging and other browsers were not revalidated by this change.

## Boundaries and follow-up

- ADR 0014 history/media regression tests remain passing. No new history store,
  automatic workspace-file import or model-context replay was added. Native
  review observations use the existing transient signal display; authoritative
  tool evidence and persisted conversation display retain their existing owners.
- Direct-edit domain validation, stale targets, preservation and pending-edit UX
  remain private. Saving is neither business approval nor media generation.
- **Existing ambient-tool isolation needs a separate correction.** Thread-scoped
  inventory on this installation still listed ambient integrations alongside
  Drawloom despite the current empty-map launch overrides. This run proves review
  and independent authority for Drawloom-exposed tools, **not** complete isolation
  of all native/ambient tools. No global settings were modified to hide this
  observation. The broader adapter isolation requirement remains in force; this
  is an implementation follow-up, not permission to broaden plugin authority.
- Native automatic-review notification fields are upstream-unstable. The adapter
  validates observed phase/status values and reports incompatibility instead of
  inventing a fallback reviewer. A new boundary requires maintainer approval.
