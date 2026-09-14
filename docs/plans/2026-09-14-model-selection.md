# Existing model selection and installation progress

Approved scope: existing Codex conversation/assessment and local MLX embeddings.
No new chat provider, model download or assessment is triggered by selection.

Use the maintainer's model-menu screenshots: compact provider/local icon,
searchable model name, selected indicator and supported reasoning choices.
Shared UI receives metadata and callbacks; host-owned discovery and selection
validation stay outside it. Settings and composer use the same selector. Embedding
models never appear as chat candidates. Unavailable configured values stay visible.

Contract amendment: optional provider-neutral model/effort selection per agent
operation. Omission retains the provider default. Providers that cannot apply an
explicit selection reject before execution. Desktop persists selection on the
conversation, blocks changes while active and validates against bounded Codex
model discovery. Native thread identity, approvals and grants remain unchanged.
Codex `model/list` and `turn/start` are existing provider operations, also used by
the accepted assessment adapter. No new MCP Apps or plugin boundary.

Primary recipe: bounded selection. Open/search/select/Escape/click-away follow
shared command/popover primitives. Discovery loading/error is inline; no model
calls, automatic fallback or invocation retries. Nightloom keeps its existing low
reasoning policy. New provider selection remains an explicitly separate action.

Download progress uses received/expected bytes for the current file, clamped to
0–100 only when the total is known. Runtime installation and verification remain
labelled indeterminate stages. Cancel stays available; no inferred overall percent.
# Refinement: effort first

## Grouped context picker

Replace the Add navigation menu with the same input-owned autocomplete used by
@. Group actual choices as Files, Plugins, Skills, Conversations; $ stays
skills-only. Add inserts an @ token at the caret so continued typing filters
without stealing focus. Anchor above the complete composer, disable collision
flipping into the input, and cap height to available space. Standard dismissal
and list navigation remain. No recency is fabricated.

The send contract adds up to four conversationContextIds. The local owner may
explicitly share recent cached user/assistant text from another registered
conversation, including across projects. Resolve IDs in the host, never paths or
browser-supplied excerpts. Read at most 12 entries and 8,000 text characters per
conversation; label omissions and entry identities. No provider import, tools,
assets, instructions or file permissions are transferred. Missing/self/empty
references fail visibly. Draft references persist per destination conversation.

## Compact composer follow-up

Use one non-wrapping toolbar: Add, approval, model/effort and Send. The standard
dropdown Add menu invokes existing file, skill and context actions; dismissal
returns focus to the composer. Typed @ and $ remain unchanged. On constrained
widths hide secondary labels before shrinking the model title; never wrap Send.
Agent setup belongs in Integrations. Remove the provider switch that created a
new conversation; cross-agent transfer remains deferred. Test menu dismissal,
typed discovery and narrow layout without submitting model work.

Browser verification at 390px: Add, approval, model and Send had identical top
coordinates (739.8125px); Send's right edge was 365px, within the viewport. Add →
Skills opened the existing picker with focus on the composer; Escape dismissed
it. The draft remained empty and no turn was submitted. The 76 layout/ViewModel
tests passed, as did desktop checking/build and UI policy.
The final canonical gate passed with 1,005 Bun tests and the Node gates.

The maintainer's next screenshot puts effort in the first panel and the model list
one level deeper. Use bounded selection plus contextual navigation: a shared
discrete effort slider with named accessible values, and a model button opening
the existing searchable list with Back. Only advertised effort levels are valid.
Commit on release rather than every drag tick. Escape/outside click dismisses;
opening again starts at effort. A provider-default or unavailable model does not
invent effort levels. Embeddings and fixed-effort assessment go straight to models.
No animation is required; all information remains available without motion.

The effort fill uses a full-height blue-to-purple gradient. No decorative
lightning icon is shown: that affordance is reserved for an independently
supported fast-mode toggle, not reasoning effort. Fast mode is not implemented.

The fill extends to the contained thumb's outer edge, not its centre. Shared
shadcn scroll-fade utilities mark sidebar, conversation, composer, command-list
and primary-view overflow. Fixed controls stay outside the mask. Small fades
hint at more content; unsupported scroll timelines use crisp edges instead of
permanently fading reachable text. Sidebar CSS translucency preserves opaque
controls and has a reduced-transparency fallback. Native desktop-behind-window
vibrancy is not enabled by this CSS change and remains unverified in Tauri.

## Verification

- Grouped picker follow-up: 80 targeted tests pass, including reference selection
  without navigation/execution and bounded cached-text extraction. Desktop
  checking reports no errors or warnings. Browser measurement: menu and composer
  both 640px wide normally and 362px at a 390px viewport, with approximately 8px
  clearance above the composer. Typing filters suggestions with textarea focus;
  deleting the trigger closes them. The preview draft was restored without sending.
  No live model call was made to test shared conversation content.
- The canonical `bun run check:ci` gate passed after the grouped-picker and
  conversation-context changes, including the UI/dependency guards and Node gates.

- Canonical gate passed: 1,003 Bun tests, plus the existing Node gates. This was
  before the final effort-panel styling refinement; subsequent desktop checking
  and builds pass without Svelte errors or warnings, and UI policy passes.
- Targeted model/driver/host tests: 18 pass. Shared component render tests:
  seven pass, including current-file byte progress, accessible percentage,
  clamping and unknown total.
- Read-only live native discovery returned six models and their supported effort
  levels. No thread or model generation was invoked for discovery.
- Browser checks exercised model search and keyboard selection, effort adjustment,
  persisted next-turn state, and the two-layer menu. The pill styling was inspected
  in the running dark-mode preview. Settings reuse the same shared composition.
- No model download was run. Progress rendering is tested using synthetic byte
  values; a complete fresh installation and a new light/narrow-screen visual pass
  remain unverified in this change.
