# Native goals and structured plans delivery

Status: implemented; closeout verification recorded below and in the
[Plan mode follow-up](0031-native-plan-mode.md).
ADR 0031 accepted by the maintainer on 2026-09-19; local commit authorised.

## Boundaries

The approved user plan is authoritative. Public Drawloom owns all generic changes;
private workbenches are verification consumers only. Preserve the single 4488
installation and existing edits. The maintainer subsequently authorised ADR
acceptance and a local commit; no pushes or publication.
No separate spike or competing continuation engine.

## Work and verification

### Attached goal and streaming refinement

The approved interaction attaches the narrower goal strip directly to the
composer, with square bottom corners. Empty goals still have no permanent row.
Shared composition owns the seam; Views do not compensate with message spacing.

The progress clock is a CSS integer-counter animation anchored to native seconds.
It is an approximate display, not accounting: new native values replace its anchor;
pause, disconnection and hidden documents stop it, and returning to the document
reads native state. Tooltip/accessibility text retains the last reported value.
Reduced motion keeps discrete digit updates but disables decorative text reveals.
Browsers without the required CSS arithmetic retain a static native-value fallback.

Live partial assistant text uses the existing Prompt Kit/Streamdown renderer's
word fade with no stagger queue. Saved history and completed text do not replay
the reveal. Active history delivery polls at the host's 100 ms coalescing cadence,
independently of the general 600 ms state refresh; existing pager ownership bounds
in-flight reads, and disposal cancels the polling. Neither timer creates native
continuations or mutates native goal accounting.

- Implemented: contract and lifecycle integration (primary agent).
- Implemented: Codex adapter and scripted tests (Terra, integrated and hardened by primary agent).
- Implemented: structured history and reopening checks (primary agent).
- Implemented: shared goal and plan presentation (Sol, integrated and browser-tested by primary agent).

## Evidence and decisions

### Closeout review: native identity before the first message

The architecture review found that creating and pausing a goal before sending
the first message could leave the native identity marked unmaterialized. Reopen
then started a replacement thread instead of reading the retained goal.
The Codex adapter now persists that identity before dispatching a goal mutation,
including when the mutation response is lost. No new goal store, host scheduler
or presentation authority was added.

Two scripted regressions failed with a missing goal before the fix and passed
after it (successful and lost mutation responses); the adapter suite passed all
26 tests. The opt-in native check also passed with
`DRAWLOOM_LIVE_GOAL_BEFORE_FIRST_TURN=1`: create before any user turn, pause,
close and reopen retained the paused objective. Native continuation occurred;
it was admitted and settled before close. Its exact disposable native task was
archived. This is distinct from the deterministic lost-response regression.

The final public canonical gate passed after this fix, including Node and packed
replacement/application checks. The private canonical gate also passed (262
tests, two opt-in media-render/model-setup skips). Public opt-in lanes remain
explicitly skipped by the canonical command; this fix does not claim new live
approval, OS credential or Temporal evidence. The existing 4488 host was
restarted with its original data directory, and the authenticated browser
reopened the saved conversation and approved episode viewer. No new visual
design, business content, permissions, commits or ADR acceptance were introduced.

### Earlier delivery checkpoints

- Read pinned Codex 0.153.4 generated schemas, DeepSeek GoalBar/round driver and
  Open Design plan normalization. These are inspection, not executed integration.
- Existing agent bridge does not reattach incomplete work after process loss;
  managed subagents remain excluded from this delivery.
- Existing DESIGN.md and shared UI README modifications belong to the earlier
  video work and must be preserved.
- History extends its validated origin union. The existing JSON column stores
  plan snapshots without a database rewrite; old entries remain unchanged.
  Every received snapshot has a distinct retained identity, including a return
  to an earlier plan. No native step identities are fabricated.
- Regression checks reproduced and corrected snapshot-content deduplication
  losing plan chronology and goals being inaccessible before a first user turn.
- The first canonical run reached 1,516 passing tests, eight skipped and two
  failures. The native stdio fixture needed explicit execution reconciliation;
  the workflow dependency closure needed the portable history contract now used
  by the agent plan schema. Targeted reruns passed after these corrections.
  This is not a final canonical-pass claim.
- Shared public-import GoalBar/Plan and ViewModel tests: 11 passed using the
  canonical Svelte export condition. A bare Bun invocation without that condition
  does not resolve the existing nested `runed` package correctly.
- Application-level continuation regression verifies a fresh operation, its
  approval association and retained plan through the real desktop composition.
- Scripted adapter suite: 24 passed, including concurrent goal creation, shared
  goals conformance, terminal events queued during admission, and active/paused/
  blocked/complete restart reconciliation without a resume mutation.
- Native Codex 0.153.4: the disposable test observed an initial terminal turn,
  separately admitted goal continuation, pause, and authoritative paused state
  after closing and reopening the connection. No host continuation prompt was
  injected. Exact owned thread cleanup returned archived.
- The first live run passed continuation and pause but failed reopen because its
  temporary directory used a noncanonical macOS path. Its owned thread was
  archived. An attempted read of that archived task was unavailable; no model
  work was repeated in it. A fresh corrected test used the canonical path and
  passed restart, then archived its exact identity. The fixture now canonicalizes
  its directory before opening a session.
- Private consumer canonical check against packed public packages: 262 passed,
  two skipped, no failures. This is consumer compatibility, not new business
  generation or approval.
- Rendered browser matrix passed in light/dark, 390px narrow layout and 200%
  zoom, with reduced motion. Goal editing, IME, keyboard disclosure, tooltips,
  structured plans and reading-position preservation were exercised against the
  installed assets with intercepted synthetic commands; no user goal was created.
  Browser testing found and corrected nullable Svelte element bindings, tooltip
  accessibility and upward wheel events inside message descendants failing to
  stop the shared scroll follower.
- Final focused adapter/application/control/ViewModel rerun: 35 passed, no
  failures. Native live evidence is distinct from these scripted checks.
- Final public `bun run check:ci` exited zero: 1,522 Bun tests passed, eight
  skipped, no failures; Node and packed replacement/application checks passed.
  This includes dependency, licence, UI policy, type and documentation checks.
- Existing installation was restarted on 4488 with its original data directory
  and selected conversation. No new installation, media generation or grants.
- Maintainer correction: no permanent empty-goal row. Creation is offered in
  the existing composer + picker; explicit selection opens the objective editor.
  Cancel/Escape removes the editor without a native mutation. Component tests,
  desktop type/build checks and the four-case browser matrix passed after this
  correction. The canonical results above include the composer action changes;
  the final no-draft-mutation change received an additional desktop build/check.
  The later attached goal and streaming refinement above supersedes this
  checkpoint's pending active-bar styling decision.
- Follow-up composer correction: `/` opens Actions and Skills, including goal
  creation; + puts Add actions before Plugins and Skills. Both use the existing
  shadcn-backed picker and scroll-fade utility. Choosing `/goal` removes its token
  and opens the editor without sending a message. URLs and multi-segment paths
  are not interpreted as slash actions. Plan-mode toggling was subsequently
  implemented in the linked Plan mode follow-up; chat forking remains outside
  this slice and is not exposed as an inert action.
- Final rendered rerun passed all four theme/width/zoom cases, including + group
  order, no draft mutation when opening +, slash filtering, skill selection and
  cancellation without sending a command. The final private canonical rerun against
  the refreshed packed public snapshot passed 262 tests, skipped two and failed none.
  No new live generation was needed for these presentation refinements.
- Typed `/goal <objective>` initially fell through to ordinary message submission
  once whitespace closed the picker. A ViewModel regression reproduced the wrong
  command type. It now dispatches native goal creation directly, preserves the
  draft on failure, and never falls back to sending a turn. Targeted ViewModel
  tests (73) and all four built-browser cases passed. The user's request was not
  automatically resubmitted. The broader full gate is rerun for this correction.
- Installed-session follow-up: a read-only goal request reproduced HTTP 400
  `invalid state`. Codex can finish its signal stream normally after disconnect;
  desktop recovery previously handled only rejected readers, retaining the closed
  session. Both reader settlement paths now retire the session, while shutdown
  keeps its own cleanup ownership. A failing owner regression and a scripted
  desktop/Codex reconnect regression cover this without repeating mutations.
  Seven targeted lifecycle/integration tests pass, including normal shutdown
  without a false connection-loss report. After restarting the same 4488
  installation, an authoritative read returned HTTP 200 with no goal; no user
  goal was created or resumed. Composer alerts and input now share the existing
  stack composition. All four rendered browser cases verify error spacing and
  draft retention, alongside typed goal routing. Final canonical rerun exited 0:
  1,527 Bun tests passed, eight skipped, none failed; declared Node and packed
  consumer lanes passed. No additional model work was submitted for this fix.
- Additional providers, managed subagents, signing, clean-machine installation
  and the broader lifecycle release matrix were not exercised by this slice.
  No real Temporal recovery lane was run; this slice adds no workflow scheduler.
