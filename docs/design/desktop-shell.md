# How the desktop shell looks and behaves

This is the implementation brief for the desktop shell — layout, theming
and navigation — for anyone building or reviewing that UI.

Status: implementation direction from the approved desktop plan; not a claim
of visual acceptance or a shipped application.

The desktop shell belongs to public Drawloom. Workbench-specific vocabulary,
recipes and business decisions belong to installed workbenches. The shell must
work without them, using an independently authored text example.

## Visual direction

Follow the recognisable Codex interaction skeleton: workspace navigation at the
left, conversation and persistent composer in the centre, optional artifact
and details pane at the right. Keep Drawloom branding. Do not copy another
product's logo or require its implementation.

[The design study](assets/desktop-shell-concept.png) is a layout and colour
reference, not an image to ship as interactive UI. Its green palette is
superseded by the neutral light/dark direction below. Its Code, Data and
Image studios and extra conversations are illustrative, not requirements —
do not seed them as fake functionality. Its leaf-like logo is not a
selected brand mark; use the Drawloom wordmark. Actual controls and records
reflect working features.

- Use [Tailwind's neutral palette](https://tailwindcss.com/docs/colors), not
  slate, zinc, stone or a green accent palette. Keep surfaces achromatic.
- A private Codex screenshot governs colour balance and hierarchy: use a
  soft grey sidebar, not near-black navigation against a lighter canvas.
  Keep workspace and workbench rows quiet; avoid simultaneous heavy selection
  cards. New conversation is an ordinary navigation action, not a filled CTA.
  Because it contains private application content, the screenshot is not a
  public asset.
- Support light and dark appearances, following `prefers-color-scheme` without
  a saved manual override. Respond to preference changes while the app is open.
- Light surfaces use white and light neutrals, dark text and fine neutral rules.
  Dark surfaces use deep neutrals, light text and restrained neutral elevation.
- Primary actions, selection, focus, avatars, composer, native controls and
  artifact/details panels all use theme tokens. Preserve readable muted text,
  disabled states and visible keyboard focus in both appearances.
- Do not invert user media, images or document contents to simulate dark mode.
  Scope this change to the desktop application; the journal has its own design.
- System sans-serif; consistent 14px navigation and controls, 15px conversation
  text, restrained 16px titles. Use normal weight for navigation; reserve medium
  weight for concise headings. Avoid oversized welcome headings and bold rows.
- Desktop sidebar approximately 240px; optional details approximately 360px.
  The centre absorbs remaining space. Do not turn every item into a card.
- Composer remains mounted and editable during execution. Input has a modest
  radius, clear focus, accessible attachments and context controls.
  It uses shadcn Sidebar and a single filled InputGroup. Primary actions use
  blue and send is circular; user messages sit right, assistant messages
  left. Root DESIGN.md owns the current exact tokens.
- Tool details and candidate records use rows, separators and disclosures.
- Plugins uses a dedicated main-content destination. Settings replaces the
  navigation with categories and Back to app restores the prior destination.
  Neither shares the artifact/details pane. The artifact pane
  remains docked and non-modal on wide screens; below 1050px an explicitly opened
  artifact is a main-content destination with the same back action, not a blocking
  detail drawer. Mobile navigation may continue to use Sidebar's standard Sheet.
- Skill and context discovery is a composer-anchored non-modal suggestion surface.
  Preserve typing focus where practical and support `$`, `@`, arrow keys, Enter
  and Escape without turning discovery into a blocking dialog.
- Small screens avoid horizontal overflow. Respect reduced motion and keyboard
  focus.

## Five connected journeys

The [approved UI sprint](../plans/2026-09-13-five-ui-journeys.md) extends this
direction without replacing the theme or MCP Apps boundary. Its implementation
and verification are in progress; the sprint record owns current evidence.

- Search is a keyboard-accessible dialog, opened from navigation or Cmd/Ctrl+K.
  It searches local titles and cached messages, labels project/workbench origin,
  and opens the exact message with a bounded history window. Incomplete cached
  coverage is explicit. Rename and reversible Archive live in conversation menus;
  Archived has a dedicated restore view.
- Clicking a project row expands or collapses its conversations; Open project
  in its menu opens the overview. Selecting a workbench opens its landing
  page. Neither creates a conversation. Creation is an explicit action using the
  chosen project/workbench; conversation headers show their fixed project binding.
- Activity is a main-content destination for existing project-scoped workflows.
  Project overview provides a current activity summary and link. Settings retains
  runtime setup, not the primary workflow-management journey.
- Working material remains a docked workspace on wide screens and a full-content
  destination with Back to conversation on narrow screens. Pane controls must
  preserve drafts, selection and conversation position; MCP Apps retain ownership
  of editing and unsaved state. No host dirty-state inference is introduced.
- Completion stays near its originating activity, with actual result links and
  supported actions. Partial results and errors remain inspectable. Tool success,
  saved drafts, business acceptance and publication are different outcomes.

## View and ViewModel responsibilities

Root [DESIGN.md](../../DESIGN.md) is the authority for voice, information hierarchy,
progressive disclosure and screen composition. The [purposeful-views pass](../plans/2026-09-14-purposeful-views.md)
records inspected Mobbin references. Plugins groups children under their owner;
Knowledge separates Search, Sources and Settings; Activity reveals one selected run;
Archived offers readable project/workbench context and Restore. Technical identifiers
remain unchanged for execution and evidence, not promoted into browsing titles.

Route shells compose services and ViewModels. Views receive projected state
and commands; they do not read native process messages, provider secrets or
private workbench types. Each principal region has a focused component.

The public shell presents workspace/workbench/conversation navigation,
conversation content, canonical tool results, generic artifact viewers,
candidate comparison and selection, explicit review commands, readiness and
configuration failures. Unknown presentation uses an honest generic fallback.
The private workbench decides what selection and review mean for its product.

No inert controls, invented progress, fake costs, hidden setup dependency or
silent synthetic replacement of a real provider. Synthetic mode is labelled.
Unavailable features explain their prerequisite. Native provider charges are
not represented as tool spending controlled by Drawloom.

## Verification

The [five-journey sprint record](../plans/2026-09-13-five-ui-journeys.md)
records implemented states, selected interaction references, browser and private
consumer results, and the limits of the captured baseline. Workspace presentation
changes retain the conversation and mounted MCP App; changing conversation remains
an explicit instance boundary. Shared media is released while inactive.

Compare an actual browser screenshot with the design study, checking layout,
neutral light/dark palette, typography, composer placement, artifact/review structure
and responsive behaviour. Verify live system-preference changes and native
desktop appearance as well as browser emulation. Record deliberate deviations above rather than
implementing invented content. Exercise navigation, sending, stopping/steering
where supported, attachments, context, artifact preview, candidate selection,
plugin readiness and persistence. Desktop transport verification is separate
from browser presentation verification.

The app token and component authority belongs in root `DESIGN.md` when
implemented. The journal retains its separate `publishing/DESIGN.md`.
