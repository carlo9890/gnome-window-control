---
id: gnomewindo-111jxs
title: Rust wctl crate with list, focused, info, help and version, gated in CI
status: open
type: feature
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-7unlkx
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

First slice of the Rust `wctl`. Today: `wctl` (bash) implements `list`,
`list --json`, `focused`, `info <ID> [--json]`, `help`, `--version`;
`tests/test-list.sh`, `tests/test-list-json.sh`, `tests/test-focused.sh`,
`tests/test-info.sh` and `tests/test-help.sh` assert their output.
`tests/test-helper.sh:19` hard-codes `WCTL="${SCRIPT_DIR}/../wctl"`.
`.github/workflows/build.yml` has one job (node --check, test-logic.sh,
build.sh). Reference behaviour, from the script:

- `dbus_call_json` / `get_windows_json` fetch `ListDetailed` once per process.
- `cmd_list` prints `No windows found.` when the array is empty, else a table
  with header `ID  TITLE  CLASS  WS  MON  F` (bold when stdout is a tty),
  titles longer than 35 chars cut to 32 chars plus `...`, workspace `-1`
  shown as `all`, `*` in `F` for `has_focus`, columns aligned like
  `column -t -s $'\t'`.
- `cmd_info` prints the eleven `Label:     value` lines (`Window:`, `Title:`,
  `Class:`, `Instance:`, `PID:`, `Workspace:`, `Monitor:`, `Focused:`,
  `Position:`, `Size:`, `States:`), or the window's JSON object with `--json`;
  a missing window prints `Window not found: <id>` on stdout and exits 1; a
  non-numeric id prints `Error: Window ID must be a number` on stderr and
  exits 1; no id prints the usage line and exits 1.
- `cmd_focused` prints `No window focused` and exits 0 when nothing has focus.
- Any D-Bus failure whose error name is `ServiceUnknown`, `UnknownObject`,
  `UnknownInterface` or `UnknownMethod` prints `Error: Window Control
  extension is not running. Enable it in GNOME Extensions.` and exits 1; other
  failures print `Error: D-Bus call failed: <message>` and exit 1.
- `wctl --version` prints `wctl 0.8.0`.

## Problem

No Rust code exists. Until one command works end to end through the bus, in
CI, and passes its live suite, every other estimate in the epic is a guess.

## Recommended action

Create the crate at `cli/` (package `wctl`, binary `wctl`, edition 2021).
Dependencies: `zbus` with the blocking API and no tokio, `clap` with derive,
`serde`, `serde_json` with `preserve_order`, `unicode-width`;
dev-dependency `assert_cmd`. Suggested modules, not a requirement: `dbus`
(one `#[zbus::proxy]` trait mirroring the interface XML, a lazily opened
blocking connection, the error mapping above), `model` (serde structs for the
`ListDetailed`, `ListMonitors`, `ListWorkspaces` JSON, field names exactly as
`extension.js` emits them), `table` (tab-separated rows aligned by display
width), one module per command group.

Declare the full command tree in clap now, so that `wctl help` already carries
every synopsis `tests/test-help.sh` asserts (`info <WINDOW>`, `move <WINDOW>
<X> <Y>`, `wait -c|-t|-s|-p <VALUE> [--timeout <SECONDS>]`, the `WINDOW
SELECTOR:` section, and so on; copy the section layout of `show_help` in the
script). Commands not implemented in this slice exit 2 with `not implemented`
on stderr; later slices remove those stubs. Implement `list`, `list --json`
(print the JSON string exactly as received), `focused`, `info <ID>` with a
numeric id only, `help`, `--version`.

Change `tests/test-helper.sh:19` to `WCTL="${WCTL:-${SCRIPT_DIR}/../wctl}"` so
a suite can be pointed at the binary.

Add to `.mise.toml` the tasks `fmt:check`, `lint` (`cargo clippy --all-targets
-- -D warnings`), `test`, `build` (`cargo build --release`) and `ci` depending
on the four, each with `dir = "{{config_root}}/cli"`. Add a job `cli` to
`.github/workflows/build.yml` that installs tools with `jdx/mise-action@v2`
and runs `mise run ci`; add `cli/**` and `.mise.toml` to both `paths:` lists.

Out of this slice: selectors, filters, every other command.

## Acceptance criteria

- [ ] `mise run ci` passes locally and the `cli` job passes on the PR
- [ ] With the extension enabled, `WCTL=cli/target/release/wctl bash tests/test-list.sh`, `...test-list-json.sh`, `...test-focused.sh`, `...test-info.sh` and `...test-help.sh` each report `Failed:  0`
- [ ] `cli/target/release/wctl --version` prints `wctl 0.8.0`
- [ ] With `DBUS_SESSION_BUS_ADDRESS` unset, `cli/target/release/wctl info abc` prints `Error: Window ID must be a number` and exits 1 without touching the bus, and `cargo test` contains that case via `assert_cmd`
- [ ] Median of 10 runs of `cli/target/release/wctl list` in the live session is at most 4 ms, and the number is recorded as a comment on this issue
