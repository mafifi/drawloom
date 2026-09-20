# Plugin presentation metadata

Status: Implemented and verified locally (2026-09-20). Maintainer approved
contract, adapter and extension changes.

## Scope and ownership

Public Drawloom owns optional discovery presentation metadata, Codex mapping,
the `org.drawloom` package declaration, confined icon loading and shared UI.
Technical identity, selection and permission remain unchanged. Private plugin
authors own their names and assets; no private assets enter public fixtures.

## Delivery

1. Define and test display names and bounded image presentation in discovery;
   define package-relative light/dark icon declarations in the extension.
2. Map native metadata and installed manifests. The host reads only confined,
   bounded image assets; unavailable icons do not fail discovery.
3. Use one shared icon presentation and display-name policy in menus/catalogue.
4. Run targeted tests, policy and canonical checks; rebuild existing 4488.

## Interaction brief

Existing picker and catalogue interactions are unchanged. Declared names label
the same stable selections; diagnostics retain technical names. Decorative icons
have empty alternative text; missing/invalid images use the same fallback with
no layout shift. Keyboard, focus, disabled states and reduced motion retain
existing shared component behavior. No new animation or execution action.

## Decisions and evidence

Codex's installed App Server schema exposes PluginInterface.displayName,
composerIcon, logo and logoDark as resolved local paths, plus remote URLs.
Local manifests expose the same fields under interface. Drawloom's standard
package schema deliberately ignores unknown fields: use its approved namespaced
extension rather than inventing standard fields. DeepSeek's registry-owned UI
metadata and Open Design's native-runtime adapter boundaries are recorded in the
[harness survey](../reference/harness-workbench-survey/README.md).

Remote-only icons remain generic in this slice: catalogue browsing does not
silently initiate external asset requests. Local images travel as bounded data
images, never filesystem paths or executable inline SVG. No new image endpoint.

## Verification ledger

- Initial inspection: discovery drops native display metadata; local catalogue
  displays registry IDs; picker has only a generic icon.
- Existing uncommitted delegation work is preserved. No commits or ADR acceptance.
- Shared contract, native adapter and installed-package tests preserve technical
  identities and selection payloads while supplying optional presentation.
- Review found blocking special files and a file-swap escape in icon loading.
  Regression tests reproduced both failures before confinement was corrected;
  the reader now checks regular files, no-follow opened handles and identity.
- Invalid native display names no longer discard valid icons. Picker search
  uses the same normalized name as its displayed label.
- Synthetic browser acceptance includes decoded plugin icons and friendly names,
  alongside the existing theme, narrow-layout and keyboard-action matrix.
- Optional editorial branding replaces old no-extension assertions; packed
  consumer checks still require original skill files and no runtime extension.
- Final public `bun run check:ci` passed: 1,618 Bun tests, eight opt-in skips,
  plus Node and installed replacement-package checks. The skipped native approval,
  OS credential, real Temporal and two mounted evaluation-view cases were not
  exercised for this presentation-only change.
- Private canonical consumer gate passed against built public artifacts:
  262 tests, two opt-in model-adoption/video-render skips. No model or paid call.
- Final public browser matrix passed. Existing 4488 was restarted in place;
  its menu and catalogue show the declared plugin names, decoded themed icons,
  and a readable owner-derived backend-services label. The approved episode
  document was reopened unchanged. Native branding mapping has scripted protocol
  evidence; no production native-plugin selection or execution was initiated.
- Read-only review findings are resolved. Missing/remote-only icon fallback is
  deliberate; no remote fetching, grant changes, new installation or commit.

## Checkpoint follow-up

Native `plugin/list` is now enabled by default in the adapter and desktop host,
with an explicit false/`0` opt-out. The regression proves omitted configuration
discovers native plugins without starting a turn. Installed 4488 discovery shows
Remotion as an available native plugin, separately from its skills; no plugin
selection or execution was submitted. Existing inventory pagination is retained.
The [context-picker checkpoint](context-picker.md) records the final public,
private and rendered verification. ADR 0032 remains Proposed; commit permission
does not accept that decision.
