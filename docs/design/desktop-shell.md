# Desktop shell implementation brief

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
reference for layout, not an image to ship as interactive UI. Its original green
palette is superseded by the owner's neutral light/dark direction below. It was generated from this
project's public synthetic text scenario. Its invented Code, Data and Image
studios and extra conversations are not requirements and must not be seeded as
fake functionality. The generated leaf-like logo is not a selected brand mark;
use the Drawloom wordmark. Actual controls and records reflect working features.

- Use [Tailwind's neutral palette](https://tailwindcss.com/docs/colors), not
  slate, zinc, stone or a green accent palette. Keep surfaces achromatic.
- The owner's later Codex screenshot governs colour balance and hierarchy:
  use a soft grey sidebar, not near-black navigation against a lighter canvas.
  Keep workspace and workbench rows quiet; avoid simultaneous heavy selection
  cards. New conversation is an ordinary navigation action, not a filled CTA.
  The screenshot contains private application content and is not a public asset.
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
  The later component amendment uses shadcn Sidebar and a single filled
  InputGroup. Primary actions use blue and send is circular; user messages sit
  right, assistant messages left. Root DESIGN.md owns the current exact tokens.
- Tool details and candidate records use rows, separators and disclosures.
- Plugins and Settings use dedicated main-content destinations with Back to
  conversation, rather than sharing the artifact/details pane. The artifact pane
  remains docked and non-modal on wide screens; below 1050px an explicitly opened
  artifact is a main-content destination with the same back action, not a blocking
  detail drawer. Mobile navigation may continue to use Sidebar's standard Sheet.
- Skill and context discovery is a composer-anchored non-modal suggestion surface.
  Preserve typing focus where practical and support `$`, `@`, arrow keys, Enter
  and Escape without turning discovery into a blocking dialog.
- Small screens avoid horizontal overflow. Respect reduced motion and keyboard
  focus.

## View and ViewModel responsibilities

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
