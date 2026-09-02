---
id: gnomewindo-urga4g
title: Window selectors and list filters in the Rust wctl
status: open
type: feature
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-111jxs
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Bash reference: `parse_window_selector`, `select_window_id_from_json`,
`resolve_window_selector`, `filter_windows_json` in `wctl`, and their unit
tests in `tests/test-logic.sh` (sections `selector_kind_for_option /
parse_window_selector`, `select_window_id_from_json`, `filter_windows_json`,
and the `expect_die` guard list). The Rust crate from the previous slice
implements `info <ID>` with a numeric id only.

Contract, from the script:

- A `<WINDOW>` is `<ID>`, `focused`, `-c CLASS`, `-t TITLE`, `-s SUBSTR` or
  `-p PID`. A numeric id makes no D-Bus call. `focused` costs one `GetFocused`
  and dies `No window focused` on id 0. The four options cost one
  `ListDetailed`, reused by the command that follows.
- Zero matches: `Error: No window matches <kind> '<value>'`, exit 1. More than
  one: `Error: <kind> '<value>' matches <n> windows; use an ID:` followed by one
  aligned line per candidate `<id>  <wm_class>  <title>`, exit 1.
- The argument count after the selector is checked before any bus call, so
  `wctl tile -c kitty` dies with `Usage: wctl tile <WINDOW> <position>` without
  the extension.
- `list --workspace <N>` keeps windows with `workspace_index == N` or
  `is_on_all_workspaces`; `--monitor <N>` and `--class <CLASS>` are exact;
  filters AND together and apply to the table and to `--json`, which then
  prints a compact re-serialization.

## Problem

Every window-taking command depends on the selector resolver, and `list` on
the filters. Without them no later slice can be tested through the suites,
which all use selectors.

## Recommended action

Implement the resolver and the filters as pure functions over the parsed
`ListDetailed` model, and wire them into `info` and `list`. Port the unit
tests from `tests/test-logic.sh` with the same hardcoded expectations, e.g.
the three-window fixture (ids 1, 2 kitty; 3 thunderbird sticky) where
`class thunderbird` resolves to 3, `class kitty` is refused with `matches 2
windows`, `--workspace 1` yields `[2,3]`, `--workspace 0 --class kitty` yields
`[1]`. Port every `expect_die` case that involves a selector or a list filter
as an `assert_cmd` test that runs with no bus.

Out of this slice: the commands that consume the resolver beyond `info`
(they arrive with the geometry and state slices), `wait`.

## Acceptance criteria

- [ ] `cargo test` passes and includes the ported fixture cases and the guard cases listed above
- [ ] With two kitty windows open, `cli/target/release/wctl info -c kitty` exits 1 and its output is identical to `./wctl info -c kitty` (compare with `diff <(...) <(...)`)
- [ ] `cli/target/release/wctl info focused --json | jq .id` equals `./wctl info focused --json | jq .id`
- [ ] `diff <(cli/target/release/wctl list --workspace 0 --json | jq -c 'map(.id)') <(./wctl list --workspace 0 --json | jq -c 'map(.id)')` prints nothing; same for `--monitor 0` and `--class kitty`
- [ ] With `DBUS_SESSION_BUS_ADDRESS` unset, `cli/target/release/wctl tile -c kitty` prints `Usage: wctl tile <WINDOW> <position>` and exits 1
