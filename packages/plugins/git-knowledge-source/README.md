# Git knowledge source

This standard Agent Plugin exposes a configured local repository through two
standard MCP tools: git.changes and git.acknowledge.

## Launch configuration

The launcher, not MCP tool arguments, supplies GIT_SOURCE_REPOSITORY,
GIT_SOURCE_PATHS (a JSON array of allowed committed paths), and PLUGIN_DATA.
No tool call can replace the repository or expand the path list. The source
does not read working-tree content, execute hooks/scripts, use the network, or
follow configured paths outside the committed tree.

## Delivery semantics and limits

Each update has id, revision, previous, kind source, state, and text. Withdrawn
means a selected file was removed from the committed tree. git.changes returns
the same pending page until its token is acknowledged, even when the repository
advances. Acknowledgements are idempotent; unknown, stale, and
cross-configuration tokens fail. Non-fast-forward history produces
reconciliation_required and never silently resets the checkpoint.

Defaults permit 200 configured files, 64 KiB per committed file, and a 512 KiB
response page. Binary, invalid UTF-8, symlink, special, and oversized files are
rejected rather than truncated. State is private, serialized, and atomically
replaced; corrupt state is reported rather than treated as empty.

The reader requires Git with `--no-lazy-fetch` support (tested with Git 2.50.1).
Missing local objects fail rather than invoking a promisor remote, transport, or
credential helper. File limits apply per delivered page; byte limits include the
MCP result representation, with an envelope reserve.

An exclusive `writer.lock` protects each data directory. Normal completion removes
it after syncing the state file and parent directory. A process killed during a
write leaves the lock and fails closed on restart: confirm that its recorded
process has stopped, then remove that exact lock before reconnecting. This is an
explicit recovery limitation, not automatic crash recovery. Do not delete the
state file to recover a lock; pending deliveries must remain replayable.

Build with the package's `build` script. The bundled Node MCP server is generated
under `dist/`; generated dependency code is not committed. The `./protocol` export
provides the feed schemas for validated consumers.

This package does not grant repository, MCP, or host authorization. It has no
Drawloom backend, UI, or knowledge-contract dependency.
