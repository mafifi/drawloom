# Microinteraction pattern catalogue

Use this catalogue to select behaviour, not animation. Name one primary recipe
for each user goal, then complete the interaction brief. Product contracts remain
authoritative: a recipe never invents lifecycle states, reversibility, progress,
permissions or retry safety.

## Quick selection

| Need | Primary recipe |
| --- | --- |
| Acknowledge a small immediate action | Immediate acknowledgement |
| Remove something that can truly be restored | Reversible removal |
| Confirm an irreversible or high-consequence action | Guarded commitment |
| Change a toggle, segment, rating, step or checklist item | Bounded selection |
| Validate and commit an editable value | Validated commit |
| Protect edits when leaving | Unsaved-change guard |
| Offer suggestions, defaults or pasted-field recognition | Assisted input |
| Reorder, pin, drag or filter a collection | Collection transformation |
| Show an unconfirmed edit immediately | Optimistic reconciliation |
| Represent saving, syncing, connectivity or remote presence | Synchronisation status |
| Wait for content or track determinate work | Loading and progress |
| Report a transient or durable outcome | Outcome notice |
| Open a command surface, drawer, tab or collapsed path | Contextual navigation |
| Draw attention or reveal supporting context | Contextual emphasis |

## Recipes

### Immediate acknowledgement

**Fit:** copy, like, submit or another small action whose result is immediate and
authoritative. **Avoid:** long-running, uncertain, destructive or externally
approved work. Respond in the activation frame; prevent accidental duplicates;
replace the action label or nearby status only when the result is known. Keep
celebration rare. Announce the outcome without moving focus. Under reduced motion,
retain text/icon change and remove bursts, rolling digits or scale. The application
owns the result; the View may own a brief press or success accent. Verify rapid
repeat, keyboard/touch activation, failure and the hundredth use.

### Reversible removal

**Fit:** removal with a real, time-bounded undo. **Avoid:** irreversible deletion
or an undo that merely asks the backend to recreate data. Remove or dim the item,
show a durable undo control with the true deadline, and preserve enough context to
restore it. Do not make a countdown animation the only timer. The application owns
the deletion receipt, deadline and restoration; the View owns presentation. Verify
undo near expiry, navigation, reload, failure, focus recovery and reduced motion.

### Guarded commitment

**Fit:** irreversible or high-consequence actions. Choose the least burdensome
safeguard supported by risk: a confirmation dialog, explicit target re-entry, or a
hold only when equivalent keyboard and assistive paths exist. **Avoid:** routine
low-risk actions; prefer reversible removal when restoration is real. Name target,
scope and consequence; revalidate authority and target version at dispatch; prevent
duplicates; distinguish pre-dispatch cancellation from an uncertain post-dispatch
outcome. Motion is decorative. Verify wrong target text, key repeat, dismissal,
stale target, failure, unknown outcome and focus restoration.

### Bounded selection

**Fit:** toggle, segmented control, stepper, rating or checklist. **Avoid:** a
choice that launches lengthy work without making that consequence explicit. Keep
the current value, valid range and availability perceivable; give immediate local
feedback; announce only meaningful changes. Never let animation delay keyboard
input or substitute for checked/selected semantics. The application owns meaningful
selection and constraints; the View may own indicator movement. Verify boundaries,
rapid changes, disabled choices, keyboard order, touch targets and reduced motion.

### Validated commit

**Fit:** phone, strength, inline edit or another value with validation and commit.
**Avoid:** using shake, colour or glow as validation. Preserve the draft, state when
validation occurs, distinguish invalid from save failure, and show a recovery path.
The application or ViewModel owns rules, draft/commit policy and operation state;
the View owns focus and local presentation. Under reduced motion replace shake or
flash with persistent text, outline and icon. Verify blur, Enter/Escape, repeated
failure, asynchronous validation, stale results and screen-reader association.

### Unsaved-change guard

**Fit:** leaving would discard meaningful local work. **Avoid:** blocking navigation
after content is durably saved, or claiming an autosave succeeded. Explain what is
unsaved and offer stay, discard and save-then-leave only when each is real. Browser,
route and close paths must share the same dirty-state authority. The application
owns dirtiness and commands; the View owns dialog focus. Verify multiple exit paths,
pending save, save failure, rapid re-entry, keyboard dismissal and reduced motion.

### Assisted input

**Fit:** suggestions, mentions, shortcuts, smart defaults or paste recognition.
**Avoid:** silently committing inferred values. Distinguish suggestion from accepted
value, preserve typed input, make provenance or reason available when consequential,
and let users undo or reject assistance. The application owns candidates and
acceptance; the View owns menu navigation and field highlighting. Verify no results,
stale results, paste into multiple fields, keyboard/touch selection, focus return
and a non-motion highlight.

### Collection transformation

**Fit:** sort, filter, pin, drag, multi-select or breadcrumb expansion. **Avoid:**
motion when the order change itself is already clear or when a large list would
become noisy. Keep the initiating control and new ordering understandable, preserve
focus, expose sort/selection semantics, and prevent pending rows from disappearing
without explanation. The application owns order/filter/selection; the View may
animate geometry. Verify empty and large sets, rapid reversal, keyboard reordering,
active filters, 200% zoom, and an immediate reduced-motion change.

### Optimistic reconciliation

**Fit:** reversible, idempotent edits with a reliable authoritative response.
**Avoid:** destructive, financial, permission-changing, ambiguous or non-idempotent
effects. Mark only the affected item pending; retain its prior value and request
identity; on rejection restore authority and provide recovery. A later response
must not overwrite a newer edit. Delay sort/filter disappearance until settlement
when needed for comprehension. The application owns concurrency and rollback; the
View owns the pending accent. Verify concurrent items, same-item re-entry, out-of-
order responses, rejection, retry safety, focus and reduced motion.

### Synchronisation status

**Fit:** autosave, offline queues, remote presence and read acknowledgement.
**Avoid:** collapsing saved, published, accepted and synchronised into one claim.
Represent the latest revision truthfully: dirty, scheduled, pending, saved, failed,
offline or conflicted only when the contract supports them. Stale completions cannot
settle newer work. Keep failures durable and editing available where safe. The
application owns revision identity, connectivity and retry policy; the View owns
quiet status presentation. Verify rapid editing, superseded requests, reconnection,
conflict, repeated announcements and static reduced-motion feedback.

### Loading and progress

**Fit:** skeletons for unknown content shape, determinate progress for measured
work, and task trays for multiple durable jobs. **Avoid:** fabricated percentages,
spinners for actions already complete, or replacing settled content unnecessarily.
Keep cancellation and continuation truthful; distinguish partial results from done.
The application owns progress and task state; the View owns placeholder geometry.
Under reduced motion stop shimmer/spin but retain status and measured fill. Verify
slow, partial, stalled, failed, cancelled and backgrounded paths plus layout stability.

### Outcome notice

**Fit:** toast for low-consequence transient acknowledgement; inline alert or status
pill for durable, blocking or contextual outcomes; notification dots only for a real
unseen count/state. **Avoid:** toast-only errors or colour-only status. Place feedback
near its cause, set honest expiry, and keep recovery available after dismissal. The
application owns outcome and unread state; shared UI may own placement and timing.
Verify repeated notices, deduplication, undo expiry, announcements, focus and reduced
motion.

### Contextual navigation

**Fit:** command palette, drawer, directional tab swap or collapsed path. **Avoid:**
using motion to disguise a route change or moving focus without a navigation event.
Expose open/current state, set predictable initial focus, trap it only for a modal
surface, restore it on close, and preserve browser/navigation semantics. The
application owns destination and availability; the View owns disclosure and focus
mechanics. Verify Escape, back, deep links, no results, keyboard-only use, touch,
screen readers and instant reduced-motion transitions.

### Contextual emphasis

**Fit:** a quiet hover/focus reveal, changed-value highlight, temporal marker, range
marker, preview transition, timezone explanation or one rare signature moment.
**Avoid:** persistent pulsing, hover-only information, repeated spectacle or motion
that adds no meaning. Provide the same content on focus/touch and retain a static
marker under reduced motion. The application owns meaning and importance; the View
owns ephemeral emphasis. Verify repeat exposure, coarse pointers, focus, zoom,
reduced motion and whether removing animation loses any information.

## Coverage of the source example set

The original 51-example inventory is retained as concept coverage, not copied code
or private product rules:

| Recipe | Covered examples |
| --- | --- |
| Immediate acknowledgement | 01 like, 02 copy, 03 submit, 25 counter, 31 notification count |
| Reversible removal | 05 soft delete |
| Guarded commitment | 04 destructive hold |
| Bounded selection | 06 toggle, 07 segmented control, 08 stepper, 09 checklist, 13 rating |
| Validated commit | 10 formatted input, 11 strength, 19 inline edit |
| Unsaved-change guard | 14 unsaved guard |
| Assisted input | 15 smart paste, 16 date shortcuts, 17 mention, 18 smart defaults |
| Collection transformation | 20 sortable list, 21 multi-select, 24 filter chips, 26 pinned rows, 42 collapsed breadcrumb, 45 drag reorder |
| Optimistic reconciliation | 23 optimistic row, 27 changed-value highlight |
| Synchronisation status | 30 autosave, 36 offline banner, 38 presence, 50 read receipt |
| Loading and progress | 32 skeleton, 35 upload, 37 task tray |
| Outcome notice | 29 toast, 34 status pill |
| Contextual navigation | 39 command palette, 40 drawer, 41 tab swap |
| Contextual emphasis | 12 live status, 22 row peek, 28 audit detail, 33 empty state, 43 keyboard target, 44 current-time marker, 46 range marker, 47 recent-item strip, 48 preview, 49 timezone detail, 51 attention accents |

This map proves no example was silently dropped. It does not require Drawloom to
implement every treatment or establish a shared interaction package.
