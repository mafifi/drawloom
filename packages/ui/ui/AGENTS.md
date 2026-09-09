# Shared UI agent guide

Read [README.md](README.md) before changing the component boundary and
[the design authority](../../../DESIGN.md) before changing presentation.

- `@drawloom/ui` owns reusable Svelte controls for public applications and
  independently composed consumers. It owns no workbench or business policy.
- Start with genuine shadcn-svelte generated components. Keep generated source
  provenance and deliberate local adjustments reviewable. Do not put a library
  name around unrelated hand-built controls.
- Bits UI imports and native control implementations belong in this package's
  `src/` tree. Applications import its public exports.
- Preserve upstream accessible behaviour, public prop types, event forwarding
  and binding support. Add shared primitives before adding a consumer.
- Keep layout and commands with consumers; use the shared theme and component
  variants for control styling. Do not introduce application-specific variants.
- Native media playback and sandboxed document viewers remain platform
  facilities. A file picker uses the shared Input with `type="file"`; it is not
  an application exception to the control boundary.
- Change the contract and focused boundary tests before changing enforcement.
  There is no inline suppression mechanism. Document any justified future
  exception narrowly in the contract and encode it in the checker tests.

Run `bun run check:ui-policy` and the package's Svelte/type checks after changes.
