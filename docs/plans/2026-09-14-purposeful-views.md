# Purposeful desktop views

Status: implementation checkpoint, initial visual and automated verification complete.
Maintainer authorised committing the UI-polish checkpoint; remaining coverage is
recorded below rather than implying every provider state has been reviewed.

## References inspected

- Plugins: [Claude connectors](https://mobbin.com/screens/e6ade293-ed67-4901-8d3c-4196c31b842e) and [selected connector](https://mobbin.com/screens/2eb6c9a1-64f2-46a8-9cf8-ba9b1897ba86): identity/status/action list, selected tools rather than registry dump.
- Project/workbench: [Claude project](https://mobbin.com/screens/1861f7d1-789d-44ad-aa42-2a17b7d03482): continuation and starting work precede supporting detail. Drawloom requires explicit creation and retains workbench selection; no copied instructions/file store.
- Archived: [ChatGPT archive](https://mobbin.com/screens/d55ce70c-e6f6-4a51-beb0-f23cbcb23a49): compact titled rows and restore. Keep a main view, omit unsupported delete.
- Activity: [Linear inbox](https://mobbin.com/screens/beb9d6b3-ec34-46d7-9332-320fcb32a338): selected-item detail, concise list status. No copied issue lifecycle.
- Conversation collection: [Claude chats](https://mobbin.com/screens/77f39de2-f3c1-4fc0-b1be-57d6fd7190d3): aligned searchable rows. No bulk actions without supported commands.
- Composer, mentions, project tree, search palette, profile and Settings: maintainer-supplied Codex screenshots in the current review; retain approved behaviour and theme.
- Knowledge: [Notion search with selected preview](https://mobbin.com/screens/b1273bdd-d65d-44be-a422-ffc0f601bacd): search above a bounded list and selected content, not installation documentation. Keep a main view, not Notion's modal. Maintainer-approved Sources and Settings separately.
- Add project: [Claude create project](https://mobbin.com/screens/e2b418b1-1db2-4b50-ad62-8c09b81e3bfe): focused short form and aligned Cancel/Create actions. Keep Drawloom's approved full-page folder chooser, not a new project-description store.

## Interaction briefs

Primary recipe is contextual navigation: select a tab/item without executing work.
Each screen must answer what it informs and enables in DESIGN.md's composition table.
Search/filter is collection transformation; restore is an authoritative reversible
organisation action with transient acknowledgement. No new permission or lifecycle.
Existing ViewModels own async state, guards, pagination and commands. Local selection
is ephemeral. Narrow presentation contracts precede leaves; shared Tabs and Buttons
own keyboard/focus. Pending remains per action; failures remain durable and uncertainty
never becomes Retry. Tab changes create no conversation, download or model call.
No animation is required; touch and keyboard use the same controls. Verify repeated
selection, empty results, errors, narrow wrapping and draft preservation.

## Coverage and verification

### Workbench Settings follow-up

The first pass missed the Workbench settings body. Apply the maintainer's Codex
Settings reference: named scope above compact label/control rows, not a repeated
heading, operator summary and full-width Save button. Primary recipe: validated
commit, using the existing per-field form and operator command. Keep conversation
workbench/project binding explicit; never relabel it using the selected landing
page. Enter and Save commit the same field, pending stays per-key, and existing
command failures remain authoritative. No autosave, new lifecycle or animation.
Verify desktop/narrow layout and retained labelled input/submit semantics.

Knowledge Settings follow-up: group model size/licence, runtime and prerequisites
in aligned definition rows; keep consent visible and move Refresh beside the
section heading. No download or maintenance behaviour changes.

| Surface | Implemented change |
| --- | --- |
| Plugins | Group by actual plugin ownership; select a plugin to inspect contributions. Keep installation/configuration separate. Technical identity is disclosed on demand; app-only labelling and connection controls remain. |
| Knowledge | Search first, with Sources and Settings separately. Evidence remains inspectable; provenance and confidence details are disclosed without leading the page. Model consent and maintenance limits remain available. |
| Activity | Compact authoritative statuses; select a run to inspect steps, attempts and existing actions. Configuration stays outside this view. |
| Project/workbench | Continuation, workbench choice and explicit creation lead; directory details are secondary, missing-directory warnings remain prominent. |
| Archive | Searchable metadata rows with Restore, pending feedback and empty state. No delete or native archival. |
| Existing approved surfaces | Retain the screenshot-led conversation/composer, project tree, command palette, profile and full-page Settings patterns. Native resource viewers and plugin-owned MCP Apps retain their boundaries and controls. |

Browser inspection used the running application and disposable public synthetic data.
Observed light/dark layouts, Knowledge empty/search/settings states, keyboard tab
selection, grouped plugin browsing and selected tools, project overview, archive and
restore, and a populated waiting Activity run with separate attempts. The Activity
fixture is presentation evidence, not a new execution/recovery test. Verified Knowledge
at 390px with reduced motion; its header and search controls fit without clipping.
No model was downloaded, no assessment started and no permission was expanded.

Local screenshots are retained outside Git under
`/private/tmp/drawloom-purposeful-views-1O5G9l/` (Activity light, Plugins light,
Knowledge dark and Knowledge narrow dark). They are disposable review artifacts.
Reference screenshots remain linked above, rather than redistributed here.

Checks run successfully: canonical `bun run check:ci`, desktop Svelte check (zero
errors/warnings), desktop production build, design lint, UI policy and diff whitespace.
Focused presentation/ViewModel suites passed (95 tests at the first checkpoint);
subsequent display-language tests passed including ownership, unknown labels and
duplicate-name identity isolation. Final copy/header adjustments also passed desktop
checking and build. The standalone browser script was updated for selecting a run,
but was not executed; browser interactions here used the in-app browser.

Remaining review: populated real knowledge chains, every provider-specific failure,
200% zoom across every surface, and installed private workbench editing were not
replayed in this pass. Existing automated coverage is not a substitute for those
visual checks. This record does not claim maintainer acceptance of the new layouts.
