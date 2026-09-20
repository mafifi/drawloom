# Browser interactions

Decision: [ADR 0033](../adr/0033-isolated-native-browser-panel.md).
Reference: existing approved workspace panel and shared shadcn Tabs, Input,
Dialog, Button and Settings compositions. No new viewer framework.

## Tab controls

The maintainer's Codex screenshot supplies the reference: each tab has its own
close control; a persistent plus menu belongs beside the tab strip. Use contextual
navigation with shared Tabs, Button and DropdownMenu. The menu offers Browser
and Workbench, not unsupported terminal or side-chat capabilities. Closing a
workbench tab hides its presentation without deleting files or discarding its
mounted state; the menu can reveal it again. Browser close waits for native
confirmation, selects an adjacent same-conversation tab when needed, and leaves
the tab and durable error visible on failure. Only the affected close is pending.
Keyboard and touch expose the same controls; close controls are siblings of tab
buttons, never nested buttons. No extra animation; reduced motion is unchanged.
Verify active/inactive/last close, failed close, menu reopen and narrow overflow.

The panel menu uses the library's selection callback and disables its optional
body scroll lock: the panel already owns its scrolling, and opening a tab must
not leave the application pointer-locked. Long titles shrink before the close
control. Restored tabs load when selected after closing a neighbour; delayed
geometry for a confirmed closed tab is ignored.

Tab-change verification: seven controller regressions, Svelte checks, UI policy
and the public rendered matrix passed. Native checks exercised blank creation,
close and selection of a restored website on the existing installation. These
checks do not establish the broader browser permission/security acceptance.

| Goal / recipe | Trigger and rule | Feedback and ownership |
| --- | --- | --- |
| Browse beside work / contextual navigation | Open browser in slash or Add actions opens a blank tab; no turn or navigation is submitted. Switchable document tab preserves the existing workbench. | Native availability is explicit. Controller owns commands and snapshot; Views receive presentation/actions. Blank address receives focus. Closing returns to the document. |
| Navigate / validated commit | Enter or Go submits a validated HTTP(S) address; back/forward reflect native availability. | Actual action is pending, page loading is separate, stop remains available. Errors persist; no automatic retry. |
| Grant device access / guarded commitment | Native origin-bound request opens a trusted Dialog; child webview is hidden beneath it. Allow once, Always allow, Block or dismissal resolves the exact request. | Only selected action shows pending. Keyboard dismissal denies. Navigation and close invalidate requests; failure never grants. OS privacy is independent. |
| Review permissions / bounded selection | Settings → Browser lists site/capability choices; Reset to Ask removes a remembered choice. | Existing settings-group/surface/row composition. Empty is Ask by default, not universal permission. Revocation does not claim an active stream stopped. |

All controls retain keyboard focus and accessible names; pointer/touch use the
same commands. No decorative motion. Reduced-motion behaviour remains complete.
Native geometry is owned by the placement adapter, not presentation constants.
Resize, scroll, app overlays and tab visibility drive placement without polling.
Repeated or concurrent mutations are not blindly retried. Native callback
authority stays outside the UI even if the UI displays stale state.

Acceptance includes both themes, narrow/docked/expanded widths, 200% zoom,
keyboard-only navigation, rapid switching, denied/dismissed/stale permission
requests and closed tabs. Browser-only fixtures verify composition, not native
WebKit security or device permission enforcement.
