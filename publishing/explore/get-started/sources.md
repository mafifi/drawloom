# Sources for "Working code" (get-started)

Not published. Each claim on page.md, with its supporting source.

## Use the app

| Claim | Source |
| --- | --- |
| Desktop brings projects, conversations and results into one application | apps/desktop/README.md, opening paragraph |
| Early preview; issues at github.com/mafifi/drawloom/issues | Page brief (maintainer instruction); publishing/site/src/pages/index.astro line 94 ("Early preview") |
| Apple silicon Mac, macOS 14 or later, Codex installed and signed in | README.md lines 13-15; apps/desktop/README.md "Native macOS verification" |
| Drawloom is free; Codex use through the person's own OpenAI account | Page brief; README.md "Licence" (Apache-2.0); apps/desktop/README.md "Start from source" ("Sending work uses that account") |
| Can start without Codex; no simulated substitute if Codex unavailable | apps/desktop/README.md "Start from source" |
| DMG filename `Drawloom-0.0.0-preview.1-arm64.dmg`, release URL | Page brief; README.md line 13 (release URL). Filename not in repository; supplied by brief |
| Install steps: open disk image, drag to Applications, open | Page brief (not in repository) |
| Signed and notarised by Apple | Page brief; knowledge/evidence/adr-0034-notarised-release.md "Release candidate: build d3ef2de" (Accepted submission, Notarized Developer ID). The repository does not itself state that the v0.0.0-preview.1 asset is build d3ef2de; relied on brief |
| Quit and reopen Drawloom if Codex installed while open | Page brief (not in repository) |
| Codex searched in usual folders; elsewhere (e.g. Node version manager) only when started from a shell whose PATH contains it | apps/desktop/README.md "Native macOS verification"; adr-0034-notarised-release.md "Explicit remaining limits" |
| Data in `~/.drawloom`: conversation records, installed-package state, managed assets; project folder is not the data folder | apps/desktop/README.md "Keep application data separate from project files" |
| Add project, choose workbench, explicitly create conversation; selecting alone should not start work; conversations retain project and workbench | apps/desktop/README.md "Start working" |
| Send selected context and images; keep drafting, steer supported work or stop | apps/desktop/README.md "Start working" |
| Ask me / Approve for me; review never replaces tool grants or accepts the result | apps/desktop/README.md "Start working" |
| Result cards; viewers for audio, video, PDFs, text; editing/comparison depend on workbench | apps/desktop/README.md "Start working", "Find conversations and inspect results" |
| Search titles and message text; rename, archive, restore without deleting history | apps/desktop/README.md "Find conversations and inspect results" |
| Install plugin packages via Plugins | apps/desktop/README.md "Trusted package backends" |
| Clean test Mac: installed, Gatekeeper accepted, launched | adr-0034-notarised-release.md "Clean test Mac" |
| Not yet run: first launch from quarantined download, real Codex conversation from Dock-launched app | adr-0034-notarised-release.md "Explicit remaining limits" |
| Signing/notarisation manual; no macOS CI job | adr-0034-notarised-release.md "Explicit remaining limits"; apps/desktop/README.md "Release gate (manual)" |

## Build with the toolkit

| Claim | Source |
| --- | --- |
| Apache License 2.0 | README.md "Licence"; LICENSE |
| The 10 capabilities (names) | README.md "Core capabilities" |
| Interface = contract; choose implementation at setup | CONTRIBUTING.md "Keep components replaceable"; docs/reference/foundation-api.md intro |
| Not ten independent services; memory uses knowledge interfaces; sandboxing from execution environment; no general model-inference API | docs/reference/foundation-api.md "Find the right interface" |
| Toolchain pinned: pnpm, Node, Rust | README.md "Development" |
| `pnpm install --frozen-lockfile` / `pnpm run check:ci` | AGENTS.md "Verification"; README.md "Development"; CONTRIBUTING.md "Prepare your contribution" |
| check:ci covers format, docs links, dependency and licence policy, types, tests | package.json `check:ci` script; AGENTS.md "Verification"; CONTRIBUTING.md "Check documentation structure and links" |
| Run UI in browser or build macOS app | apps/desktop/README.md opening paragraph |
| Five replaceable parts listed; chosen in trusted startup code; Drawloom keeps enforcement, permission, shared screens | docs/reference/replacing-capabilities.md "What can you replace?" and intro |
| Conformance suites; run before trying in desktop | docs/reference/replacing-capabilities.md "Verify the replacement"; CONTRIBUTING.md "Test the behaviour" |
| Public examples illustrate shape, not durable replacements; type check alone insufficient | replacing-capabilities.md "Supply learning without a local installer", "Verify the replacement" |
| Plugin package: Agent Plugins 1.0.0 `plugin.json`, `skills/`, `mcp.json`; no Drawloom dependency needed | docs/reference/plugin-packages.md "Standard package" |
| Install, enable, trust, sign in, grant are separate; inspection does not start servers | plugin-packages.md "Install without confusing access and permission" |
| Trusted backend; MCP Apps UI; backend trust is trust in host-process code, not containment | plugin-packages.md "Trusted enhancement", "Supply a backend", "Open the workbench UI" |
| Plugins can add a Settings page | docs/reference/plugin-settings.md; AGENTS.md (ADR 0029) |
| Agree interface changes first; test failure, cancellation, recovery; say what you tested | CONTRIBUTING.md "Before you start", "Test the behaviour, not just the code" |
| Licence review for dependencies | CONTRIBUTING.md "Review dependency licences" |
| Everything committed is public | CONTRIBUTING.md "Public and commercial boundary" |
| DCO 1.1 sign-off with `git commit --signoff`; not a copyright assignment | CONTRIBUTING.md "Sign off your commits"; DCO file |

## Links checked to exist

LICENSE, DCO, README.md, CONTRIBUTING.md, apps/desktop/README.md,
docs/reference/foundation-api.md, docs/reference/replacing-capabilities.md,
docs/reference/plugin-packages.md, docs/reference/plugin-settings.md,
knowledge/evidence/adr-0034-notarised-release.md. README anchor
`#core-capabilities` matches heading "Core capabilities".

## Unverified in repository (taken from the brief)

- DMG filename, install steps, and "quit and reopen" advice.
- That the published v0.0.0-preview.1 asset is the notarised build recorded in
  the evidence file.
- Note: apps/desktop/README.md "Release gate (manual)" still says notarisation is
  "not yet done"; the later evidence record (23 September 2026) supersedes that line.
