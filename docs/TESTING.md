# Testing

Test layers, how to run them, and the CI gates. To reload and drive the extension
by hand see [RUNNING.md](RUNNING.md).

## Test layers

| Layer | Suite | Needs extension? | Command |
|-------|-------|------------------|---------|
| Crate tests (CI gate) | `cli/src/**` + `cli/tests/cli.rs` | No — headless | `mise run test` |
| Query (read-only) | `tests/run-all-query-tests.sh` | Yes | `./tests/run-all-query-tests.sh` |
| Modification (state-changing) | `tests/run-all-modification-tests.sh` | Yes | `./tests/run-all-modification-tests.sh` |

The shell suites run the release binary at `cli/target/release/wctl`, so build it
first (`mise run build`). Set `WCTL` to test a different one, for example the
installed binary: `WCTL=$(command -v wctl) ./tests/run-all-query-tests.sh`.

## Crate tests (the CI gate)

`mise run ci` runs `cargo fmt --check`, `cargo clippy --all-targets -D warnings`,
`cargo test` and the release build. **`.github/workflows/build.yml` runs it on
every push and PR** on a bare `ubuntu-latest` runner, so it is the automated gate.
None of it needs an extension, a GNOME session, or D-Bus.

Two kinds of test live there:

- **Unit tests** next to the code (`cli/src/geometry.rs`, `cli/src/selector.rs`)
  cover the geometry math, the tile grid, selector parsing and the list filters.
  Expected values are **hardcoded**, never recomputed from the implementation's
  own formula.
- **Argument-guard tests** (`cli/tests/cli.rs`) run the real binary with
  `DBUS_SESSION_BUS_ADDRESS` pointed at a socket that does not exist, so any case
  that reached the bus would report a connection error instead of the expected
  message. That is what proves validation happens before the call.

The suite also asserts the command inventory stays in sync across the dispatch
table, the help text and both shell completions, so a command that is not wired
into all of them fails `cargo test`.

## Query and modification tests

Both need the extension enabled and running. Query tests are read-only.
Modification tests spawn a kitty window (found through `wctl wait -p`, which
replies once the window is shown) and exercise every state-changing command
(move, resize, move-resize, place, tile, center, minimize/maximize, fullscreen,
above, sticky, activate, focus, move-to-workspace, move-to-monitor, wait, the
selector forms, close), asserting geometry within a pixel tolerance. **They
disrupt your desktop** (create/move/focus/close a window, switch workspace).

`tests/test-workspaces-monitors.sh` (query) covers `workspaces`, `monitors`,
the `list` filters and the read-only selector forms. Both suites need the
extension build that has the workspace/monitor/wait methods loaded; against an
older loaded build they fail on "No such method" rather than skipping.

If the extension is not running the suites self-skip and the runner reports
`NO ... TESTS EXECUTED` (a distinct SKIPPED state), never a false pass.

`WCTL_TEST_SETTLE` sets how long the modification suite waits for a state change
before asserting (default 0.5 s). Geometry lands asynchronously, and in a nested
session that default is too short — use `WCTL_TEST_SETTLE=1.5` there, see
[RUNNING.md](RUNNING.md).

A failing assertion does **not** abort a suite. The helpers record the failure
and return 0 on purpose: the suites run under `set -euo pipefail`, so a non-zero
assertion would kill the script at the first failure, skip every later case and
any diagnostic the suite prints, and leave the runner reporting "no tests
executed" instead of a failure. Read the summary, not an assertion's status.

`tests/test-helper.sh` holds the shared assertions (`assert_equals`,
`assert_within`, `assert_contains`, ...). Reuse them rather than re-implementing
pass/fail logic in a suite. `tests/geometry-helper.sh` holds the expected
workarea parsing and tile geometry for the modification suite: it is an
independent oracle, and the same pixels are pinned by hand in the crate's unit
tests, so the two cannot drift silently.

## Minimum checks before a PR

| Action | `mise run ci` | Query | Modification |
|--------|---------------|-------|--------------|
| Before commit | **MUST pass** | **MUST pass** | Optional |
| Before push | **MUST pass** | **MUST pass** | Optional |
| Before release | **MUST pass** | **MUST pass** | **MUST pass** |

Modifying JavaScript also requires `node --check` (see [CODING.md](CODING.md)) and
an actual reload-and-run in a shell (see [RUNNING.md](RUNNING.md)).
