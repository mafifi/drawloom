# Run the Drawloom desktop

The desktop brings projects, conversations, workbenches and their results into
one application. You can run its UI in a browser on your own machine or build
the macOS application. Both use the same local host.

## Start from source

Use the Bun version pinned in the root `package.json`. From the repository root:

```sh
bun install --frozen-lockfile
bun run desktop:build
bun run desktop:start
```

Open the one-use sign-in URL printed by the host. It listens only on
`127.0.0.1`, using an available port. Treat that URL as private.
Press Ctrl+C in the terminal to stop the host.

You can start the application without a model or private workbench. To ask a real
agent to do work, install Codex and complete its own sign-in first. Sending work
uses that account. Drawloom does not silently substitute a simulated response
if Codex is unavailable.

### Keep application data separate from project files

New installations store application data in `~/.drawloom`. This includes
conversation records, installed-package state and managed assets. A project
folder is where your working files live; it is not the application's data folder.

To try a separate installation without touching existing data:

```sh
DRAWLOOM_DATA_DIR=/absolute/path/to/separate-drawloom-data bun run desktop:start
```

Choose the path before running the command. Reuse it to reopen the same local
installation; do not run two hosts against it at once. Set `DRAWLOOM_PORT` if
you need a particular port.

An existing `~/Library/Application Support/Drawloom` directory is selected
when it is the only existing default. If both defaults exist, set
`DRAWLOOM_DATA_DIR` explicitly. Startup does not merge, move or delete them.
See [conversation storage](../../docs/reference/conversation-history.md#local-provider-and-data-selection).

## Start working

Add a project, choose a workbench and explicitly create a conversation.
Selecting a project or workbench alone should not start agent work. Conversations
retain the project and workbench they were created with.

The built-in Text studio also supports a synthetic test driver for local tests.
It uses supplied text rather than a model and exercises the word-count tool.
This is a development fixture, not a second AI integration; its tool grant starts
denied. Tests can select it explicitly without making a paid request.

The composer supports sending selected context and images to Codex. Audio,
video, PDFs and text files have viewers, but viewing a file is not proof that
the agent can consume that format natively. While Codex is working you can
continue drafting, steer supported work or stop it.

Use **Ask me** for human review, or **Approve for me** when native delegated
review is available. The choice belongs to the conversation, changes while idle
and applies to the next turn. Review never replaces Drawloom's tool grants or
accepts the result as finished. Read-only tool annotations can avoid native
review, but not the independent grant check.
[ADR 0015](../../docs/adr/0015-working-material-ownership-and-edit-approval.md)
explains these distinctions.

## Find conversations and inspect results

Search covers cached titles and message text, including optional project and
archive filters. Opening a match shows its surrounding messages; “Back to latest”
returns to the newest page. Search does not call a model or fetch older Codex
history. Saved pages remain readable when Codex is unavailable.

Rename, archive and restore organise Drawloom conversations without deleting
their history or archiving native Codex sessions. Archive is unavailable while
the conversation has active work or pending input or approval.

Open result cards to inspect their material. Editing, comparison and selection
depend on what the owning workbench supports; none automatically generates or
publishes work. Composer changes made while Send is waiting remain as the next
draft. The built-in document editor stays attached to its original document;
changing documents or conversations cancels its unsaved edits. Plugin editors
manage their own saving behaviour.

The interface follows the operating system's light or dark appearance.
Shared controls and layout guidance live in [DESIGN.md](../../DESIGN.md).

## Trusted package backends

Use Plugins to install a standard package and explicitly trust any Drawloom
backend it declares. Ordinary skills and MCP servers do not need a custom
backend. See [plugin packages](../../docs/reference/plugin-packages.md) for the
directory layout and installation steps.

A backend runs trusted local code. Its default export implements
`PluginBackendFactory` from `@drawloom/desktop-host` and returns its
contributions, controllers, MCP connections and cleanup function. It receives
only the declared host capabilities. Configuration is not permission to use a
tool, and credentials must stay out of UI snapshots.

Use the host asset APIs to save material for viewers. Large files use streaming
reads and writes; managed assets and browser uploads may be up to 256 MiB, while
model input has separate limits. Plugin browser UI uses MCP Apps, not arbitrary
host routes or a new browser API.

Package problems are reported without disabling unrelated packages. Backends
must report later readiness problems in their controller state.
The [desktop host guide](../../docs/design/desktop-host.md) covers these APIs and
project-specific state in detail.

## Native macOS verification

Building the app requires the Rust/Tauri build tools as well as the source
dependencies. With those tools installed and Cargo on your PATH, run:

```sh
bun run --cwd apps/desktop tauri build --bundles app
```

The output is
`apps/desktop/src-tauri/target/release/bundle/macos/Drawloom.app`.
It packages the frontend, compiled Bun host and staged worker dependencies.
Codex remains a separate prerequisite. Optional workflows also require Node and
Temporal as described in the
[Temporal guide](../../packages/orchestration/temporal-orchestration/README.md).

The native shell opens only the local host's exact origin, exposes no Tauri
commands to web content and stops the host when it exits. A local build is not
a signed or notarized release. Do not infer Windows or Linux support from the
macOS setup.

Optional knowledge setup and its current runtime-download limitations are
documented in the [knowledge guide](../../docs/design/local-knowledge.md).
Starting the desktop does not consent to a model download.
