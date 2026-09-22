# Native launch regression report

Date: 2026-09-22

## Scope

The native shell now constructs the production host command from the resources
that `bundle:host` actually installs:

- executable: `host/host/node`
- script argument: `host/host/main.mjs`
- worker runtime: `DRAWLOOM_NODE_PATH` defaults to the selected host runtime

`DRAWLOOM_HOST_BIN` remains a direct executable override for development. When
`DRAWLOOM_NODE_PATH` is already explicitly set, that worker-runtime override is
preserved; otherwise it follows the selected host executable. No wrapper or
compatibility binary was added, and no host/application/UI files were changed.

## Checks

The required failing-first check initially failed to compile because the
production `host_command` builder did not exist:

```text
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml production_host_command_executes_bundled_node_entrypoint -- --nocapture
error[E0425]: cannot find function `host_command` in this scope
```

After the implementation:

- `/Users/afifim/.cargo/bin/cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml` — passed.
- `/Users/afifim/.cargo/bin/cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml production_host_command_executes_bundled_node_entrypoint -- --nocapture` — **1 passed, 0 failed**. The fixture launches a real Node executable through the staged `host/host/node` path, executes `host/host/main.mjs`, and verifies the worker runtime environment.
- `/Users/afifim/.cargo/bin/cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` — **29 passed, 0 failed**.
- `/Users/afifim/.cargo/bin/cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` — passed.
- `git diff --check` — passed.

The unqualified `cargo` command was unavailable in this shell; the pinned
toolchain executable at `/Users/afifim/.cargo/bin/cargo` was used instead.

## Concerns and handoff

- This slice did not rebuild or launch the signed/native app. The parent task
  owns that integration check against disposable data.
- The fixture relies on a Node executable available on `PATH` (or
  `DRAWLOOM_TEST_NODE`) and symlinks it into a temporary staged-resource tree;
  it removes that tree after execution.
- The app still inherits an explicit `DRAWLOOM_NODE_PATH`, by design, so a
  development worker-runtime override remains possible. Production defaults to
  the bundled runtime.

