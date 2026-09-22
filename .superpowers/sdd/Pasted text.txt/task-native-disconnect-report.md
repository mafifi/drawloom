# Native service-death presentation and retained pending evidence

## Interaction brief

Primary recipes: **Synchronisation status** for host availability and **Outcome notice** for retained uncertain tool activity.

| Field | Contract |
| --- | --- |
| User goal | Understand whether live controls are safe to use after the local host stops, while retaining drafts, saved history and truthful evidence about effects whose outcome is unknown. |
| Trigger | System-triggered when the authoritative state read or command transport becomes unavailable. Reconnection is recognized only after a fresh authoritative state snapshot is read. |
| Rules | Live approval, input, Stop, steer and active-work presentation are invalid while disconnected. Commands are rejected at the ViewModel boundary. No mutation is retried. Drafts and saved history remain. A retained tool start without a terminal result is uncertain, never successful or failed; one terminal result supersedes its pending row. |
| Feedback | A durable local-host error replaces false active feedback. Retained starts appear in conversation order with “Outcome uncertain” and explicit no-automatic-retry guidance. Fresh state restores only the actions it authoritatively reports. |
| Loops | Repeated failed reads remain disconnected without accumulating notices or submissions. A successful full refresh exits disconnected mode. Rapid command activation while disconnected remains inert. |
| Modes | Ordinary history/discovery errors and validation errors do not revoke otherwise authoritative live state. Only host state/command availability failures do. |
| Inputs | Disabled shared controls cover pointer, touch and keyboard. The command boundary independently rejects stale programmatic actions. Status text uses semantic roles and does not rely on colour or motion. |
| Reduced motion | No new motion. Meaning remains in persistent text, disabled semantics and tool status labels. |
| Ownership | The desktop ViewModel owns host availability, stale-live-state invalidation and command guards. Conversation presentation owns ordering/deduplication. Views render projected state with existing shared UI primitives. |
| Signature value | Quiet competence: interruption is made truthful without animation or celebration. |
| Verification | Disconnect during approval and active work; stale command rejection; draft/history preservation; fresh-state recovery; validation/history error isolation; retained pending reopening; same-operation placement; terminal-result supersession; rendered uncertain status. |

### State map

| State | Visible and announced feedback | Available actions | Exit condition |
| --- | --- | --- | --- |
| Connected, idle | Settled conversation | Actions authorized by fresh state | State read fails or work starts |
| Connected, active | Working/approval feedback from current state | Only current authoritative controls | Completion, interruption or disconnect |
| Disconnected | Local-host error; no false Working/approval/input presentation | Draft/history inspection and editing only; live commands blocked | Fresh authoritative state snapshot |
| Reconnected | Fresh state replaces invalidated live fields | Only controls present in the fresh snapshot | Normal lifecycle |
| Retained uncertain effect | Tool row says “Outcome uncertain”; no success/failure invented | Inspect evidence; no automatic retry | A terminal result for the invocation is retained |

## Root cause and implementation

The browser ViewModel retained the last valid `DesktopSnapshot` when the authoritative
`/api/state` read failed. Its catch branch reported an error and cleared only the state token;
approval cards, native inputs, capability controls, `activeOperation`, and command dispatch
continued to derive from stale state. The same boundary also did not revoke authority when a
command transport itself became unavailable.

The durable evidence store was already correct: an unmatched `ToolStart` remained in
`pendingTools`, including its invocation and operation identities, and a terminal result removed
it from that pending projection. `desktop-snapshot.ts` already published this field. The omission
was in conversation presentation, which grouped terminal activity but never projected starts.

The ViewModel now owns one central availability decision. An unavailable or malformed authoritative
state read, a command transport failure, or a host-side 5xx response clears actionable live fields
and native capabilities while retaining
the snapshot's conversations, projects, operator material, local draft, and independently loaded
history. Its command boundary rejects all stale calls. Command validation errors and history-only
read failures do not revoke host authority; an invalid state response revokes stale actions without
being labeled as host death. Clearing the state token forces the next successful read to
be a fresh authoritative snapshot before controls return; no mutation is replayed.

Cached goal objective and accounting remain visible after invalidation. Their clock is frozen and
the shared GoalBar disables every mutation until fresh state restores authority.

Conversation presentation now groups retained starts at the last non-tool history entry with the
same operation identity, falling back to the conversation tail when no anchor exists. A matching
terminal invocation suppresses the start defensively, even though the evidence store normally
does so already. The existing `ToolActivity` composition accepts both terminal and pending
evidence and presents orphaned/recovered starts as “Outcome uncertain” with explicit
no-automatic-retry guidance. Starts still owned by the authoritative active operation are not
mislabelled uncertain.

## RED / GREEN evidence

RED, before production edits:

```text
pnpm exec vitest run apps/desktop/src/lib/view-model.test.ts apps/desktop/src/lib/conversation-view.test.ts apps/desktop/src/lib/tool-outcome.test.ts apps/desktop/src/lib/pending-tool-activity.test.ts
5 failed, 90 passed; one missing-component suite. Failures were the stale active operation,
unguarded command dispatch, absent pending projection/grouping, and absent rendered component.
```

GREEN after the implementation and isolation additions:

```text
pnpm exec vitest run apps/desktop/src/lib/view-model.test.ts apps/desktop/src/lib/conversation-view.test.ts apps/desktop/src/lib/tool-outcome.test.ts apps/desktop/src/lib/pending-tool-activity.test.ts packages/ui/ui/tests/goal-components.test.js
Focused crash-recovery regressions passed (107 tests at the final focused checkpoint).

pnpm --filter @drawloom/desktop check
svelte-check found 0 errors and 0 warnings.

pnpm exec vitest run apps/desktop/src/lib apps/desktop/host/evidence.test.ts packages/ui/ui/tests/goal-components.test.js
40 files passed; 274 tests passed.

pnpm run check:format
Checked 814 files; no fixes required.

pnpm run check:ui-policy
UI policy: OK (929 maintained source files).

pnpm run check:types
Exit 0.
```

## Limitations

These public regressions use controlled browser/host responses and server rendering. The main
task owner retains responsibility for the signed native build, real host kill/reconnect artifact,
and canonical `pnpm run check:ci` run. No mutation retry behavior was added. The main-owned
`apps/desktop/src-tauri/icons/Assets.car` change was preserved and excluded from this work.
