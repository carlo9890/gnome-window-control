# Testing

Test layers, how to run them, and the CI gates. To reload and drive the extension
by hand see [RUNNING.md](RUNNING.md).

## Test layers

| Layer | Suite | Needs extension? | Command |
|-------|-------|------------------|---------|
| Crate tests (CI gate) | `cli/src/**` + `cli/tests/cli.rs` | No — headless | `mise run test` |
| Rules grammar (CI gate) | `tests/check-rules-format.js` | No — headless | `gjs -m tests/check-rules-format.js` |
| Query (read-only) | `tests/run-all-query-tests.sh` | Yes | `./tests/run-all-query-tests.sh` |
| Modification (state-changing) | `tests/run-all-modification-tests.sh` | Yes | `./tests/run-all-modification-tests.sh` |

The shell suites run the release binary at `cli/target/release/wctl`, so build it
first (`mise run build`). Set `WCTL` to test a different one, for example the
installed binary: `WCTL=$(command -v wctl) ./tests/run-all-query-tests.sh`.

## Crate tests (the CI gate)

`mise run ci` depends on the `fmt:check`, `lint`, `test` and `build` tasks in
`.mise.toml`. CI runs the same command on a bare `ubuntu-latest` runner (see
[CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md)), so it is the automated gate. None of it
needs an extension, a GNOME session, or D-Bus.

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

## The rules.json grammar check (a CI gate)

```bash
env -u GI_TYPELIB_PATH gjs -m tests/check-rules-format.js
```

Asserts `window-control@carlo9890.github.io/rules-format.js` — every validation
message, the `place` token grammar, the tile grid, the centring formula and the
match predicate — against `tests/vectors/rules-spec.json`. No GNOME session, no
D-Bus, no mutter typelib: `rules-format.js` imports nothing, which is why the
extension job in `.github/workflows/build.yml` can run this on `ubuntu-latest`
with only the `gjs` package.

**The same vectors are read from Rust** by the `rules_spec_vectors` test in
`cli/src/rules.rs`, so `wctl rules check` and the extension cannot disagree
about whether a file is valid or about the message text. Changing a message or
a formula on one side fails the other side's check. Adding a validation rule
means adding a case to the vectors in the same commit, and
[specs/RULES-JSON.md](specs/RULES-JSON.md) is the normative definition both
follow.

`env -u GI_TYPELIB_PATH` is not decoration: it is what proves the module still
loads without the typelib. Drop it and a stray `gi://` import goes unnoticed
locally and breaks CI.

## Other headless GJS checks (no shell needed)

Extension logic that does need `Meta` — anything in `rules.js`, `extension.js`
or `window-helpers.js` — can still be exercised with `gjs -m` outside a shell,
by pointing `GI_TYPELIB_PATH` at the mutter typelib directory
(`/usr/lib/x86_64-linux-gnu/mutter-14` on GNOME 46) and importing the module by
`file://` URL:

```bash
GI_TYPELIB_PATH=/usr/lib/x86_64-linux-gnu/mutter-14 gjs -m check.js
```

Those are written per change rather than checked in. Anything reachable this way
must be verified this way before a shell is even considered; see the hard rules
in [RUNNING.md](RUNNING.md).

## Query and modification tests

Both need the extension enabled and running, plus `jq` and `gdbus`. Query tests
are read-only. Modification tests need `kitty` installed — they spawn a kitty
window (found through `wctl wait -p`, which replies once the window is shown)
and exercise every state-changing command
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

| Action | `mise run ci` | Rules grammar | Query | Modification |
|--------|---------------|---------------|-------|--------------|
| Before commit | **MUST pass** | **MUST pass** | **MUST pass** | Optional |
| Before push | **MUST pass** | **MUST pass** | **MUST pass** | Optional |
| Before release | **MUST pass** | **MUST pass** | **MUST pass** | **MUST pass** |

The rules-grammar column applies to any change under
`window-control@carlo9890.github.io/rules-format.js`, `cli/src/rules.rs` or
`tests/vectors/`. It is headless and takes well under a second, so there is no
reason to skip it.

Modifying JavaScript also requires `node --check` (see [CODING.md](CODING.md)) and
an actual reload-and-run in a shell (see [RUNNING.md](RUNNING.md)).
