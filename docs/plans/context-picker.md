# Searchable files and chats

Status: Implemented and verified locally, 2026-09-20.

The maintainer's Codex screenshot is the visual reference. The plus menu informs
users which kinds of input they can add, not every available document. Files and
chats are progressively disclosed through the existing shared MentionPicker.

## Interaction brief

- Recipe: assisted input with contextual navigation; no new animation.
- `+` shows attachment, actions, plugins and skills, followed by a persistent
  **Files and chats** heading with muted **Type to search files or chats** below.
  The instruction enters context search with the existing keyboard/pointer action.
  It does not
  enumerate documents or conversations. `/` retains actions and skills.
- Files and chats inserts an `@` query at the end of the preserved draft and
  focuses the composer. Typing `@` directly reaches the same state.
- An empty query prompts searching. Nonempty queries group available text files
  and other unarchived conversations; no matching result is an honest empty state.
- Selection adds existing removable context chips and consumes only the matching
  query token. It does not send, navigate, read new files or grant access.
- Escape/Tab dismiss through existing keyboard behavior; cancellation preserves
  typed text. Reopening resets the query; repeated selections stay deduplicated.
- The ViewModel owns modes, results and commands; shared picker owns disclosure,
  focus semantics and scroll fade. Pointer/touch and keyboard use the same choices.
- Existing upload pending/error presentation remains unchanged. Local cached
  context search has no asynchronous pending or retry state.
- Verify mode isolation, preservation, selection/removal, empty results, keyboard,
  themes, narrow/zoomed layouts and installed 4488. No private repository changes.

## Verification

- Test-first regression for isolated, initially empty context search; 81 ViewModel
  tests pass, covering retained drafts, chips and chat filtering/removal.
- Public browser matrix passes, including plus-to-context focus, no inventory in
  plus, empty/no-match results, Escape preservation and both themes.
- Existing 4488 reloaded in place: searched retained files and chats, selected a
  file by Enter without sending, removed that test selection and reopened the
  approved episode viewer. Original blank draft restored; no model calls.
- Canonical `bun run check:ci` passes: 1,620 Bun tests, eight existing opt-in skips,
  plus Node and replacement-package checks. Live native approval, OS credentials,
  Temporal and two mounted evaluation-view opt-in cases were not run here.
- Follow-up review corrected the search instruction into the visible grouped
  footer, using the shared picker rather than a separate menu. It remains visible
  while the inventory above it scrolls.
- Removed the redundant composer disclaimer. Installed inspection traced the
  large bottom gap to an outer conversation container scrolled by 108px, not
  composer padding. That clipping container is no longer a scroll container;
  history retains its own scrolling. Browser regression prevents recurrence.
- Final checkpoint: canonical gate passes (1,621 Bun tests, eight opt-in skips;
  Node and replacement-package lanes passed), plus public rendered browser matrix.
  Private built-consumer gate passes (262 tests, two opt-in skips). Installed
  docked review reports zero outer scroll and the standard bottom gutter; the
  approved episode viewer reopens without a workflow-startup warning after an
  orderly host restart. No model calls or content changes were needed.
