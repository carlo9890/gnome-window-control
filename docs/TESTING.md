# Testing

Test layers, how to run them, and the CI gates. To reload and drive the extension
by hand see [RUNNING.md](RUNNING.md).

## Test layers

| Layer | Suite | Needs extension? | Command |
|-------|-------|------------------|---------|
| Pure logic (CI gate) | `tests/test-logic.sh` | No — headless | `bash tests/test-logic.sh` |
| Query (read-only) | `tests/run-all-query-tests.sh` | Yes | `./tests/run-all-query-tests.sh` |
| Modification (state-changing) | `tests/run-all-modification-tests.sh` | Yes | `./tests/run-all-modification-tests.sh` |

## Pure-logic tests (the CI gate)

`tests/test-logic.sh` sources `wctl`'s pure helper functions (geometry math,
tile-grid math, argument validation, completion generation) and needs no
extension, GNOME Shell, or D-Bus. **`.github/workflows/build.yml` runs it on every
push and PR** on a bare `ubuntu-latest` runner, so it is the automated gate.

Run it after any change to `wctl` logic. It also asserts the command inventory
stays in sync across help, dispatch, and both shell completions, so a command that
isn't wired into all of them fails the suite. When adding a `wctl` command or pure
helper, add a case here with **hardcoded** expected values (not values recomputed
from the implementation's own formula).

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

`tests/test-helper.sh` holds the shared assertions (`assert_equals`,
`assert_within`, `assert_contains`, ...). Reuse them rather than re-implementing
pass/fail logic in a suite.

## Minimum checks before a PR

| Action | Pure-logic | Query | Modification |
|--------|-----------|-------|--------------|
| Before commit | **MUST pass** | **MUST pass** | Optional |
| Before push | **MUST pass** | **MUST pass** | Optional |
| Before release | **MUST pass** | **MUST pass** | **MUST pass** |

Modifying JavaScript also requires `node --check` (see [CODING.md](CODING.md)) and
an actual reload-and-run in a shell (see [RUNNING.md](RUNNING.md)).
