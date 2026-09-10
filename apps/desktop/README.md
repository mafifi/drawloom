# Drawloom desktop

Public SvelteKit/TypeScript UI with a small Tauri shell and a shared Bun local
host. No private package, credential, service or model is needed to boot.

From the repository root:

```sh
bun install --frozen-lockfile
bun run desktop:build
DRAWLOOM_DATA_DIR=/your/chosen/project-directory bun run desktop:start
```

Open the one-use bootstrap URL printed by the host. It binds only to 127.0.0.1
on a random port; optionally set `DRAWLOOM_PORT`. Reuse the data directory to
restore project navigation, assets, revisions, review and grants. A new directory
is an independent project, allowing a second consumer scenario without source
changes. Each browser/native host should have its own data directory; simultaneous
processes writing one directory are not supported.

Synthetic mode supports Text studio, saves supplied text as a draft and uses the
real word-count gateway. The grant starts denied. Settings can grant it explicitly.
Select Codex to create a separate real process-backed conversation. Selection
initializes the local Codex process; sending starts a model operation and uses
the existing Codex account. The app never falls back from Codex to synthetic.
Codex must be installed and signed in using its own setup flow. The default host
does not download models or request a new API key.

The composer offers **Ask me** (default) and **Approve for me** when the connected
provider supports native delegated review. The choice is saved per conversation,
changes only while idle, and applies to the next turn. Codex reviews mutating and
unclassified Drawloom MCP tools; explicit read-only annotations bypass that
review, not Drawloom's independent tool grant. Native review never accepts
business content. The sandbox and approval policy remain unchanged. See
[ADR 0015](../../docs/adr/0015-working-material-ownership-and-edit-approval.md).

The composer stays editable during execution. Codex supports steering and stopping;
synthetic does not claim those optional methods. Imported images can be sent to
Codex. Imported audio/video/PDF/text files have viewers, but are not claimed as
native agent input. Text artifacts can be chosen as untrusted reference context.
Editing documents creates immutable revisions. Comparison, selection and review
are separate commands; none triggers generation or publication.
An editor is pinned to its original document. Changing document/conversation
cancels unsaved document edits; incoming artifacts cannot retarget Save.
Composer edits made while Send waits are retained as the next unsent draft.

Conversation display persists separately in `history.sqlite`, including synthetic
conversations. Open the latest 50 entries and use “Load earlier” to page backward;
cached pages do not require Codex. Native transcript, compaction and execution
continuity remain with Codex. Stored history is never automatically model context.
The UI reports synchronization errors without retrying execution.
New installs default to `~/.drawloom`; the old Application Support location is
retained when it is the only existing default. If both exist, select explicitly
with `DRAWLOOM_DATA_DIR`. Nothing is moved or deleted. See
[history operation and API](../../docs/reference/conversation-history.md).

## Trusted package backends

Install a standard package in Plugins and explicitly trust its namespaced backend
entrypoint. The default export satisfies `PluginBackendFactory` from
`@drawloom/desktop-host`. The host calls it once with declared capabilities and
dependency availability. Return contributions, controllers, named MCP connections
and cleanup. Requested host storage is installation-scoped. Use
`assets.put(bytes,mediaType)` to create assets the host can serve safely. Configuration
is not a grant. Snapshot fields must be explicitly safe for display; credentials
stay inside the connection owner. Plugin browser code runs only through MCP Apps.
Trusted generated media may be up to 256 MiB per asset; browser imports and
native image inputs remain 16 MiB. This is a whole-buffer, bounded-memory API,
not streaming. See [memory and upload limits](../../docs/design/desktop-host.md).

The backend module is an explicit trusted-code choice by the local operator. No
marketplace, auto-install, hot reload or arbitrary HTTP/file routes are supported.
Invalid package components fail visibly without blocking unrelated packages.
Readiness failures after startup belong in the controller's snapshot.

## Native macOS verification

```sh
PATH="$HOME/.cargo/bin:$PATH" bun run --cwd apps/desktop tauri build --bundles app
```

The output is `src-tauri/target/release/bundle/macos/Drawloom.app`. The app includes
the static frontend and a compiled Bun host; it does not depend on Bun being
installed on the user's PATH. Codex remains an external, explicitly selected
prerequisite. The native shell launches the host, accepts only its exact loopback
origin, exposes no Tauri commands to web content, and closes the host on exit.
Release builds and native synthetic transport are verified on macOS. Windows,
Linux, signing, notarization and distribution are not claimed.

Appearance automatically follows the OS light/dark setting using Tailwind neutral
colours, with no persistent manual override. The journal has a separate design.
