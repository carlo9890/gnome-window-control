---
id: gnomewindo-kagf71
title: Geometry and tiling commands in the Rust wctl
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

Bash reference in `wctl`: `cmd_move`, `cmd_resize`, `cmd_move_resize`,
`cmd_place`, `cmd_tile`, `cmd_center`, and the pure helpers
`resolve_place_size`, `resolve_place_position`, `resolve_tile_geometry`,
`parse_workarea_rect`, `get_workarea_for_window_json`. Unit tests with
hardcoded pixel expectations: `tests/test-logic.sh` sections
`resolve_place_size`, `resolve_place_position`, `resolve_tile_geometry`.
`tests/test-modifications.sh` sections `Geometry Tests` and `Tile/Center
Tests` assert the results within `GEOM_TOLERANCE=10` px.

Contract, from the script:

- `move <WINDOW> <X> <Y>`: X, Y integers (negative allowed); `Move`; prints
  `Window moved`.
- `resize <WINDOW> <W> <H>`: positive integers (0 rejected: `Width must be a
  positive number`); `Resize`; `Window resized`.
- `move-resize <WINDOW> <X> <Y> <W> <H>`: `MoveResize`; `Window moved and
  resized`.
- `place <WINDOW> <X> <Y> <W> <H>`: exactly four tokens after the selector;
  X is a number or `left|center|right`, Y a number or `top|center|bottom`,
  W/H a positive number or `<n>%` of the workarea (0 px result rejected);
  needs the window's `ListDetailed` entry (for `monitor_index`) and
  `GetWorkarea(monitor)`; `MoveResize`; `Window placed`.
- `tile <WINDOW> <position>`: nine positions on a 4x2 grid (`cell_w = wa_w /
  4`, `cell_h = wa_h / 2`, integer division; e.g. workarea `0 27 1920 1053`:
  `top-left` is `0 27 480 526`, `center` is `480 27 960 1052`, `bottom-right`
  is `1440 553 480 526`); `Window tiled to <position>`.
- `center <WINDOW> [horizontal|vertical|both]` with `h`/`v` short forms,
  default `both`; keeps the size and uses `Move`; messages `Window centered`,
  `Window centered horizontally`, `Window centered vertically`; bad axis:
  `Invalid axis: <axis>. Must be 'horizontal', 'vertical', or 'both'`.
- Every `(false,)` reply prints `Window not found: <id>` on stdout, exit 1.

## Problem

These six commands carry all the arithmetic in the CLI. They are the part of
the port where a wrong integer division or a swapped axis produces a window
in the wrong place with no error, so they need the pinned pixel expectations,
not just "it ran".

## Recommended action

Port the three pure helpers as functions with the exact integer semantics
above, and port every hardcoded case from `tests/test-logic.sh` into `cargo
test` (including the boundary cases: window larger than the workarea giving
negative positions, `150%`, width 1001 flooring to 250). Implement the six
commands on top of the selector resolver. Port the `expect_die` guards for
`move`, `resize`, `move-resize`, `center`, `place`, `tile` as `assert_cmd`
tests.

Out of this slice: state and activation commands, workspace and monitor
moves, and running `tests/test-modifications.sh` as a whole (it aborts on the
first failing section, and its later sections need the next slice).

## Acceptance criteria

- [ ] `cargo test` passes and includes the ported pixel cases named above
- [ ] With a kitty window `W` open and not maximized, for each of `move W 100 100`, `resize W 800 600`, `move-resize W 200 200 900 700`, `place W center top 50% 100%`, `tile W top-left`, `tile W center`, `center W`, `center W h`: running it through `cli/target/release/wctl`, reading `./wctl info W --json | jq .frame_rect`, then running the same through `./wctl` gives the same `frame_rect` within 10 px; record the eight comparisons as a comment
- [ ] `cli/target/release/wctl resize W 0 100` prints `Error: Width must be a positive number` and exits 1 without a bus call
- [ ] `cli/target/release/wctl move-resize W 0 0 abc 100` prints `Error: Width must be a positive number` and exits 1
