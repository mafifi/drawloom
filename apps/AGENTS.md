# Application agent guide

This guide applies under `apps/`.

- Applications are private composition-root workspaces with
  `drawloom.role: "composition"`.
- Declare the actual host with `drawloom.runtime`; do not label an application
  portable merely because it consumes portable packages.
- Use `catalog:` for external dependencies and `workspace:*` for internal
  Drawloom packages.
- SvelteKit is the default UI framework.
- Hosted applications may compose Cloudflare providers and bindings without
  leaking them into portable packages.
- Local desktop applications use Tauri. Keep Rust inside the Tauri shell and
  command boundary; core product contracts and capability logic remain
  TypeScript.

Run `bun run check:dependency-policy` after changing an application manifest.
