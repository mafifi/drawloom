# Native recovery fixture

This opt-in acceptance fixture uses the real packaged Tauri shell and bundled
host with a deterministic stdio provider and an installed streamable-HTTP MCP
tool. It does not call a model, add a production endpoint, bypass a grant, or
replace the bundled host. It is not proof of real Codex behavior, signing,
notarisation, or Temporal recovery.

The operator controls the native launch and every termination. Use a fresh
fixture root for each case and never point these commands at `~/.drawloom` or a
real project.

## Portable check

```sh
node --test apps/desktop/tests/native-recovery-fixture.node-check.mjs
```

## Prepare one native case

From the repository root, set the exact final app and create a disposable root:

```sh
APP=/absolute/path/to/Drawloom.app
FIXTURE_ROOT=$(mktemp -d /tmp/drawloom-native-recovery-XXXXXX)
node apps/desktop/tests/native-recovery-fixture.mjs serve \
  --root "$FIXTURE_ROOT" --app "$APP"
```

Keep `serve` running. It starts its loopback MCP server, installs and configures
the standard package through one authenticated bundled-host process, then uses
a second authenticated bundled-host process to create the project and
conversation and grant the single discovered `pkg_` alias. Both setup hosts
close before it prints `ready-for-native-launch`. The controller never prints
the bootstrap URL, cookie, MCP bearer header, message text, or a credential.

In a second terminal, launch the exact native executable with the fixture's
data, project, provider state, and minimal PATH:

```sh
env -u DRAWLOOM_HOST_BIN -u DRAWLOOM_NODE_PATH -u NODE_PATH \
PATH="$FIXTURE_ROOT/bin:$APP/Contents/Resources/host/host:/usr/bin:/bin:/usr/sbin:/sbin" \
DRAWLOOM_DATA_DIR="$FIXTURE_ROOT/data" \
DRAWLOOM_PORT=4498 \
DRAWLOOM_NATIVE_RECOVERY_ROOT="$FIXTURE_ROOT" \
DRAWLOOM_NATIVE_RECOVERY_PROJECT="$FIXTURE_ROOT/project" \
"$APP/Contents/MacOS/drawloom-desktop"
```

Confirm port 4498 is unused before launch and use the same explicit isolated
port on reopen. Do not inherit a host replacement, Node module path, or host
Node override from a development shell.

Record the exact shell PID and its one bundled-host child PID. Verify both with
the process table before recording them; never select processes by name alone.

```sh
node apps/desktop/tests/native-recovery-fixture.mjs record-launch \
  --root "$FIXTURE_ROOT" --case kill-shell \
  --shell-pid SHELL_PID --host-pid HOST_PID
```

Use `graceful`, `kill-shell`, or `kill-host` for the case being run.

## Admit exactly one synthetic turn

In the real UI, confirm the restored fixture project, conversation, package and
grant. Send the fixed harmless prompt `Synthetic native recovery` exactly once.
Wait until the UI shows active work. Then run:

```sh
node apps/desktop/tests/native-recovery-fixture.mjs release-admission \
  --root "$FIXTURE_ROOT"
```

This command requires the provider's `turn-start-replied` barrier and reads only
the distinct `operation_id` for the receipt's exact conversation from the
fixture history database in read-only mode. It fails unless exactly one
operation identity exists. It does not read message text or use the native
host's bootstrap credential.

Wait for the holding tool and native approval to appear in the UI, then verify
the external barriers:

```sh
node apps/desktop/tests/native-recovery-fixture.mjs assert \
  --root "$FIXTURE_ROOT" --phase pending
```

That assertion requires matching launch, admitted turn, effect-started, and
approval-requested receipts; exactly one turn and one MCP call; no effect finish;
and no approval decision.

## Terminate and reopen

For `graceful`, quit through the app UI. For a forced case, terminate only the
recorded shell PID or only the recorded host PID. Wait for the exact recorded
process and its recorded children to exit. Do not use `pkill`, a name match, or
a broad process group. The provider must produce its termination receipt:

```sh
node apps/desktop/tests/native-recovery-fixture.mjs assert \
  --root "$FIXTURE_ROOT" --phase terminated
```

Relaunch the same executable with the same environment and root. Do not Send
again. Confirm through the native UI that the original project, conversation,
history, installation and grant remain, and that no guessed completed or failed
tool result appears. Re-run the `pending` assertion; the provider counters must
remain one. A killed host may invalidate the old native approval presentation,
so verify its absence and stale-decision safety rather than claiming the old
presentation remains actionable.

Stop the controller with Ctrl+C only after the app, host, provider, and MCP
connections have closed. Remove the fixture root only after confirming every
exact PID exited. Retain the root and report cleanup failure when process or
outcome status is uncertain. Never release `effect-release` during a crash case.
