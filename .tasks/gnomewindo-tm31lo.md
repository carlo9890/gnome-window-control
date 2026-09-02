---
id: gnomewindo-tm31lo
title: workspaces, monitors and wait in the Rust wctl
status: open
type: feature
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-urga4g
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Bash reference: `cmd_workspaces`, `cmd_monitors`, `parse_json_flag`, `cmd_wait`
and `dbus_call` (the `DBUS_CALL_TIMEOUT` handling) in `wctl`. Suite:
`tests/test-workspaces-monitors.sh`, which also exercises the selector and
filter forms from the previous slice and is the last suite the query runner
`tests/run-all-query-tests.sh` needs.

Contract, from the script:

- `workspaces [--json]`: `ListWorkspaces`; table header `IDX  NAME  WINDOWS
  ACTIVE`, empty name shown as `-`, `*` in `ACTIVE`.
- `monitors [--json]`: `ListMonitors`; header `IDX  X  Y  WIDTH  HEIGHT
  SCALE  PRIMARY`, `*` in `PRIMARY`.
- `wait -c|-t|-s|-p <VALUE> [--timeout <SECONDS>]`: exactly one selector
  option, default timeout 10, `--timeout` must be a positive integer; calls
  `WaitForWindow(kind, value, timeout*1000)` with a client-side bound of
  timeout plus 5 seconds; prints the id on stdout and exits 0, or `Error:
  Timed out after <N>s waiting for a window (<kind>: <value>)` and exits 1 on
  a 0 reply. Guards: `Usage: wctl wait ...` for no or two selectors, `PID must
  be a number`, `Timeout must be a positive number of seconds`, `Option
  --timeout requires a value`.
- `--json` on `workspaces`/`monitors` prints the extension's string as is;
  any other argument is `Unknown option: <arg>` or `Unexpected argument: <arg>`.

## Problem

The read-only surface is incomplete without these three, and `wait` is the
one command whose D-Bus call is long-running: it must not inherit a default
client timeout shorter than the extension's.

## Recommended action

Implement the three commands over the proxy. For `wait`, set the call timeout
explicitly (zbus has no default; bound it at timeout plus 5 s so a hung shell
still returns). Port the `expect_die` guards for `wait`, `workspaces`,
`monitors` from `tests/test-logic.sh` as `assert_cmd` tests.

Out of this slice: `workspace <N>`, `move-to-workspace`, `move-to-monitor`
(state-changing; they arrive with the state slice).

## Acceptance criteria

- [ ] `WCTL=cli/target/release/wctl ./tests/run-all-query-tests.sh` prints `ALL QUERY TESTS PASSED` with every script marked passed (the runner still executes `tests/test-logic.sh` against the bash script at this point; that is expected)
- [ ] `diff <(cli/target/release/wctl workspaces) <(./wctl workspaces)` and the same for `monitors` print nothing
- [ ] `kitty --title wait-rs & cli/target/release/wctl wait -p $! --timeout 10` prints a numeric id and exits 0; `cli/target/release/wctl wait -c no-such --timeout 1` exits 1 after about 1 s with the `Timed out after 1s` message
- [ ] `cargo test` includes the guard cases for `wait`, `workspaces --bogus` and `monitors --bogus`
