# Applications

Applications bring Drawloom's packages together into something a person can use.
They choose the implementations and connect them to the UI.

## Run the desktop

The [desktop application](desktop/README.md) uses SvelteKit for its interface,
a local Node host for application work, and a small Tauri shell for macOS.
Follow its guide to run it from source or build the native app.

The public journal lives separately under [publishing](../publishing/site/README.md).
It is not part of the desktop application.

## Build an application

Use the public interfaces and select providers during application setup.
Keep platform-specific code there rather than adding it to portable packages.
A possible hosted deployment is not a tested deployment until its own setup and
verification exist.

All source in this directory is public. The `private: true` package setting
prevents publishing the application as a package; it does not hide its code.
See [Contributing](../CONTRIBUTING.md#public-and-commercial-boundary) before
bringing work from another repository here.
