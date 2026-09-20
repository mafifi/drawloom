# Drawloom app icon

`Drawloom.icon` is the editable Icon Composer source using the selected
[Drawloom artwork](../../../../publishing/site/public/artwork/drawloom/README.md).
The build imports its authoritative transparent PNG before compilation. A native
system-dark background and group shadow sit beneath that foreground. The PNG's
material highlights remain baked in; individual ribbons are not separate layers.
The old SVG and `Drawloom-preview.png` are retained historical references, not
the current default artwork.

`bun run --cwd apps/desktop bundle:icon` uses Apple's `actool` to compile the
source into `Assets.car` and the `Drawloom.icns` compatibility fallback. Both
generated artifacts are retained so public checks do not require Xcode. The
normal native build regenerates them and bundles them with `CFBundleIconName`
set to `Drawloom`. This is independent of signing and notarisation.

Do not edit the generated artifacts or introduce a second logo. Regenerate from
`Drawloom.icon` when artwork changes. Bundle wiring tests do not substitute for
installed Dock/Finder visual acceptance.

Earlier native wiring check, 2026-09-20: the unsigned bundle contains `Assets.car` and
`Drawloom.icns`, names the icon in its Info.plist, and Finder Get Info renders
the saved Drawloom artwork. Separate Dock appearance and older-macOS fallback
rendering remain release checks.
