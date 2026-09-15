# Learning controls and evidence disclosure

Status: interaction brief for implementation; not visual acceptance.
Reference: existing approved Knowledge settings and conversation disclosures in
DESIGN.md. Keep their shared controls, spacing and neutral colours.

## Enable learning deliberately

Goal: decide whether Drawloom may use retained knowledge in conversations and
retain selected outcomes. Trigger: separate labelled controls in Knowledge
settings, initially off. Recipe: bounded selection with validated commit.

The host owns persisted values. Explain before enabling that selected material
will reach Codex, capture is limited to participating tools, and disabling stops
new disclosure without erasing older native turns. Existing curation remains a
separate control. Do not turn an enable action into a download or model call.

Pending save uses the existing StatefulButton. Success is quiet; failure retains
the previous authoritative value and a durable inline error. Prevent duplicate
saves; refresh cannot overwrite a newer successful save. Rapid toggles change
the draft, not secretly committed permission. Keyboard, touch and screen readers
receive labelled checked state and the same save action. No motion required.

## Understand what knowledge accompanied a message

Goal: inspect relevant references without reading internal machinery. Trigger:
a compact Knowledge used disclosure beside the originating message. Recipe:
contextual navigation. Show a count, then readable record identity/status and
existing evidence inspection actions; do not duplicate full bodies.

Prepared, empty, disabled and unavailable are distinct. Only unavailable needs
a quiet explanatory status; disabled needs no per-message lecture. A reference-
only oversized record is labelled as such. Evidence inspection rechecks access;
cached disclosure metadata is not permission to read a current record.

Disclosure expansion is local View state; preparation and entry data belong to
the host/history and ViewModel. Escape/back and pane changes preserve the draft
and conversation. Existing shared Collapsible controls provide keyboard and
touch equivalence. No animation is needed for reduced motion.

## Verification

Exercise initial off, enable/save, failed save, disable during preparation,
rapid changes, reopen persisted settings, ready/empty/unavailable preparation,
oversized reference-only selection and revoked evidence access. Check actual
light/dark rendering, 390px, 200% zoom, visible focus and keyboard expansion.
Unit tests and builds alone do not establish these visual checks.
