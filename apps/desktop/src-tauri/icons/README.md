# Drawloom app icon

`Drawloom.icon` is the editable Icon Composer source using the selected
[Drawloom artwork](../../../../publishing/site/public/artwork/drawloom/README.md).
The registered lobes and ribbon PNGs are separate layers, above a native
system-dark background. Both foreground layers use 65% scale in Icon Composer.
Material highlights are partly baked into the raster layers; Icon Composer adds
its native effects. Individual ribbons are not separate layers. The earlier
`Drawloom-preview.png` is a historical reference, not the current default artwork.

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

Layer correction, 2026-09-20: reopened the saved two-layer source in Icon Composer
and reviewed ribbons above lobes at 65% scale, including the 32pt 2x preview.
The native app rebuild compiled the same source successfully, and Finder Get Info
rendered the smaller layered icon from that exact rebuilt bundle. Dock appearance
and older-macOS fallback rendering remain release checks.
