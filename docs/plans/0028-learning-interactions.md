# Learning settings without a required local installer

This implements the approved ADR 0028 plan, using the existing Knowledge tabs and
settings grouping and the maintainer's Codex settings reference. No new visual
language or navigation mode is introduced.

## What the screen is for

Search and inspect retained knowledge. In Settings, choose what Drawloom may
remember, use in conversations and curate. Local installation details appear only
when the trusted desktop composition supplies them. Evidence and source collection
stay available independently of a model download.

| Interaction | Pattern and rules | Feedback and recovery |
| --- | --- | --- |
| Save learning preferences | Validated commit; a preference is not permission | Keep the draft on failure. A saved choice requiring permission shows a separate confirmation; saving alone never approves disclosure. |
| Confirm processing | Guarded commitment; show purpose, data, destinations and processing boundaries supplied by the host | Confirm the exact scope shown. Pending confirmation blocks duplicate clicks; changed scope requires a fresh decision. Failure stays visible. |
| Run curation now | Loading and progress; requires scoped permission, not the automatic preference | Consent-required, cancelled, busy and unavailable are distinct. Do not silently enable automatic work or automatically retry uncertain work. |
| Install a local model | Loading and progress; separate ViewModel and endpoint | Preserve byte progress, cancellation, retry and cleanup confirmation. A failed installer must not erase search results or block learning controls. |
| Change views while requests run | Contextual navigation | Preserve drafts during refresh; abort obsolete reads and discard late responses on disposal. No background response changes the selected tab. |

The shared View receives presentation/actions only. Its ViewModel owns drafts,
pending operations and response lifetimes. A separate local setup View receives
its own presentation/actions; the shell supplies it, not the learning provider.

Checkboxes and buttons retain keyboard, touch and screen-reader semantics. Focus
stays with the initiating control unless an explicit dialog opens. Durable inline
messages provide meaning without motion; no new animation is needed. Verify both
themes, 390px, 200% zoom, reduced motion, repeated/failed saves, unsupported curation,
scope confirmation and local download/search independence.
