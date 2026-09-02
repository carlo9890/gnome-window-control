---
id: gnomewindo-zr8nrl
title: State, activation, workspace and monitor move commands in the Rust wctl
status: open
type: feature
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-tm31lo
  - gnomewindo-kagf71
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Bash reference in `wctl`: `cmd_activate` (its own option parsing: `-t`, `-s`,
`-c`, `-p`, or a positional id; calls `ActivateByTitle`,
`ActivateByTitleSubstring`, `ActivateByWmClass`, `ActivateByPid`, `Activate`;
keeps the extension's first-match rule, no ambiguity check), `cmd_focus`,
`cmd_simple_state` (minimize, unminimize, maximize, unmaximize, fullscreen,
unfullscreen, close), `cmd_bool_state` (above, sticky: `on|true|1` and
`off|false|0`, else `State must be 'on' or 'off'`), `cmd_workspace`,
`cmd_move_to_workspace`, `cmd_move_to_monitor`, `report_result`. Suite:
`tests/test-modifications.sh` end to end, through
`tests/run-all-modification-tests.sh`.

Messages, from the script: `Window activated`, `Window focused`, `Window
minimized`, `Window unminimized`, `Window maximized`, `Window unmaximized`,
`Window fullscreened`, `Window unfullscreened`, `Window closed`, `Window set
to always-on-top` / `Window removed from always-on-top`, `Window set to all
workspaces` / `Window removed from all workspaces`, `Switched to workspace
<N>` / `Cannot switch to workspace <N> (does it exist? see wctl
workspaces)`, `Window moved to workspace <N>` / `Window <id> not found or
workspace <N> does not exist`, `Window moved to monitor <N>` / `Window <id>
not found or monitor <N> does not exist`, and `Window not found: <id>` for the
rest. Index arguments must match `^[0-9]+$`: `Workspace index must be a
number`, `Monitor index must be a number`.

## Problem

These are the last commands. Until they exist the modification runner cannot
pass, and the modification runner is the epic's evidence that behaviour held.

## Recommended action

Implement the commands over the proxy and the selector resolver, reusing one
`report_result` equivalent for the boolean replies. `activate` keeps its own
argument parsing and never uses the resolver. Port the remaining `expect_die`
guards from `tests/test-logic.sh` (`above 123 maybe`, `sticky 123 maybe`,
`workspace abc`, `move-to-workspace 123 abc`, `move-to-monitor 123 -1`, the
`Usage:` cases) as `assert_cmd` tests. Remove every `not implemented` stub;
`grep -rn 'not implemented' cli/src` must print nothing afterwards.

Out of this slice: completions, the cutover.

## Acceptance criteria

- [ ] `WCTL=cli/target/release/wctl ./tests/run-all-modification-tests.sh` prints `Failed:  0` with all sections executed (the suite spawns a kitty window; run it on the live session or in a nested session per `docs/RUNNING.md`)
- [ ] `grep -rn 'not implemented' cli/src` prints nothing
- [ ] `cargo test` includes the guard cases named above
- [ ] With the kitty window `W`: `cli/target/release/wctl above W maybe` prints `Error: State must be 'on' or 'off'` and exits 1 without a bus call
