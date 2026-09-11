# Application agent guide

This guide applies under `apps/`.

- Applications here are public-source reference compositions with
  `drawloom.role: "composition"` and `private: true` to prevent package
  publication. The flag does not make their code confidential. Proprietary
  workbenches belong outside this repository; see `../ARCHITECTURE.md`.
- Declare the actual host with `drawloom.runtime`; do not label an application
  portable merely because it consumes portable packages.
- Use `catalog:` for external dependencies and `workspace:*` for internal
  Drawloom packages.
- SvelteKit is the default UI framework.
- Use Svelte 5 rune props/derived state in views consuming the desktop ViewModel.
  Legacy prop deep-reading can traverse the entire catalogue per component even
  when the visible list is paginated. Keep browser-scale regressions in
  `desktop/tests/`, outside portable UI packages.
- Import reusable controls from `@drawloom/ui`; its
  [component contract](../packages/ui/ui/README.md) owns the supported boundary.
  Add missing primitives there using shadcn-svelte before composing them in an
  application. Do not create local control libraries or import Bits UI directly.
- Use `StatefulButton` for actions with observable waiting, such as persistence,
  provider work and uploads. Wire action progress to `pending` and keep ordinary
  eligibility conditions in `disabled`; the component contract owns the feedback
  behaviour. A sibling navigation or cancel `Button` may be disabled to prevent
  concurrent work without presenting itself as the running action.
- Review command handlers for appropriate progress and error feedback. The UI
  policy check rejects explicit `aria-busy`, `pending` and `isLoading` props on
  shared `Button` imports, including named aliases and namespace imports. It does
  not infer asynchronous behaviour from handler names or a `disabled` expression,
  follow indirect component aliases, or inspect spread props; passing this check
  does not replace semantic review of the action.
- Keep application views responsible for layout, content and command wiring.
  Follow DESIGN.md's four-layer theme contract: use semantic colours and shared
  type tokens, not raw palette values, primitive --dl-* tokens or repeated local
  type scales. One-off layout measurements remain appropriate.
  Semantic HTML, ordinary links and native media viewers remain appropriate;
  reusable controls and their interaction behaviour belong to the shared UI.
- Compose conversation rows with Message/Bubble, file cards with Attachment,
  and progress with Marker from `@drawloom/ui`. Use the shared scroll-fade and
  shimmer utilities only where they explain overflow or ongoing work. Keep real
  status text, keyboard access and reduced motion; do not replace approval forms,
  native viewers, streaming or history logic with presentation components.
- Hosted applications may compose Cloudflare providers and bindings without
  leaking them into portable packages.
- Local desktop applications use Tauri. Keep Rust inside the Tauri shell and
  command boundary; core product contracts and capability logic remain
  TypeScript.

Run `bun run check:dependency-policy` after changing an application manifest.
Run `bun run check:ui-policy` after changing maintained UI source.
