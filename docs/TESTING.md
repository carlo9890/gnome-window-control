# Testing

Test layers, how to run them, how to add a suite, and the CI gates. To reload
and drive the extension by hand see [RUNNING.md](RUNNING.md).

## Test layers

| Layer | Suite | Needs extension? | Command |
|-------|-------|------------------|---------|
| Crate tests (CI gate) | `cli/src/**` + `cli/tests/cli.rs` | No — headless | `mise run ci` (`mise run test` is the inner-loop subset) |
| Rules grammar (CI gate) | `tests/check-rules-format.js` | No — headless | `env -u GI_TYPELIB_PATH gjs -m tests/check-rules-format.js` |
| Extension against fake windows (CI gate) | `tests/check-extension-headless.js` | No — headless, needs the mutter typelib | `dir=$(find /usr/lib* -name 'Meta-*.typelib' -printf '%h\n' \| sort -V \| tail -1) && GI_TYPELIB_PATH=${dir:?no Meta-*.typelib installed} gjs -m tests/check-extension-headless.js` |
| Query (read-only) | `tests/run-all-query-tests.sh` | Yes | `./tests/run-all-query-tests.sh` |
| Modification (state-changing) | `tests/run-all-modification-tests.sh` | Yes | `./tests/run-all-modification-tests.sh` |
| Keyboard shortcuts (state-changing, in the modification runner) | `tests/test-keybindings.sh` | Yes, plus injected keys | `./tests/test-keybindings.sh` in a headless shell or a VM guest's session (see below) |

The live suites were last run green on 2026-10-10 on GNOME Shell 46.0 (the
real session of an Ubuntu 24.04 libvirt guest, with the extension installed
from the built zip) and 50.1 (a headless shell on Ubuntu 26.04); both paths
are in [RUNNING.md](RUNNING.md). Add a version here when you run them on another one.

## The keyboard-shortcut suite

`tests/test-keybindings.sh` presses every shortcut and asserts the frame that
lands, through the same oracle as the modification suite. It cannot press keys
on the real desktop: it injects them with `tests/inject-keys.js` over mutter's
`org.gnome.Mutter.RemoteDesktop` API, which needs a shell that has no real
keyboard in front of it. Run it against a headless shell started with
`scripts/start-headless.sh`, or against the real session of a VM guest over
SSH (both in [RUNNING.md](RUNNING.md)); on this desktop's session it would
press the keys into the shell that started it. It skips when
the loaded extension does not report the `keybindings` capability, and it
expects the schema defaults, so reset a rebound key first.

The shell suites run the release binary at `cli/target/release/wctl`, so build it
first (`mise run build`). Set `WCTL` to test a different one, for example the
installed binary: `WCTL=$(command -v wctl) ./tests/run-all-query-tests.sh`.

## Crate tests (the CI gate)

`mise run ci` is the gate (see `.mise.toml`); CI runs the same command on a bare
`ubuntu-latest` runner. None of it needs an extension, a GNOME session, or D-Bus.
Coverage is not measured; `mise run ci`, the two release checks below and the
suites in the minimum-checks table are the whole bar.

Two kinds of test live there:

- **Unit tests** in a `#[cfg(test)]` module next to the code they cover —
  geometry, selector parsing, the rules.json grammar, table output, the command
  inventory. Expected values are **hardcoded**, never recomputed from the
  implementation's own formula.
- **Argument-guard tests** (`cli/tests/cli.rs`) run the real binary with
  `DBUS_SESSION_BUS_ADDRESS` pointed at a socket that does not exist, so any case
  that reached the bus would report a connection error instead of the expected
  message. That is what proves validation happens before the call.

The inventory assertions in `cli/src/main.rs` and `cli/tests/cli.rs` keep the
command list in sync across the dispatch table, the help text and both shell
completions, so a command that is not wired into all of them fails `cargo test`.

The `cli` job also runs two release checks. Run them locally before a push
that changes a version or a dependency:

```bash
./scripts/check-version.sh   # cli/Cargo.toml is 0.<metadata.json version>.0
mise run build:musl          # the static release binary, and its linkage check
```

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

## The extension check against fake windows (a CI gate)

```bash
dir=$(find /usr/lib* -name 'Meta-*.typelib' -printf '%h\n' | sort -V | tail -1) &&
    GI_TYPELIB_PATH=${dir:?no Meta-*.typelib installed} gjs -m tests/check-extension-headless.js
```

With several mutter typelibs installed, this picks the newest one; with none,
it stops with `no Meta-*.typelib installed`.

Runs the real `extension.js`, `rules.js` and `keybindings.js` against fake
windows and a fake display that count their signal handlers. No GNOME session,
no D-Bus: the check copies the extension files into a temporary directory and
points the shell-only imports (`ui/main.js`, `extensions/extension.js`,
`gi://Shell`) at stubs written there. It needs the mutter typelib
(`/usr/lib/x86_64-linux-gnu/mutter-14` on GNOME 46, package `gir1.2-mutter-14`),
which the extension job in `.github/workflows/build.yml` installs.

It pins:

- the `disable()` teardown that [RELEASING.md](RELEASING.md) requires:
  `unexport()` fails a pending `WaitForWindow` and `WaitForGeometry` with
  `Disabled` and leaves no handler, subscription or timer, and
  `WindowKeybindings.disable()` destroys a pending `UnmaximizeWait`;
- both wait methods drop a call, with no reply, when its caller leaves the bus,
  also when the caller left before the call was handled;
- `WaitForWindow` for a window created during an earlier wait and mapped after
  it, for one created minimized during an earlier wait and not yet mapped, and
  for a dialog retyped to `NORMAL` after it was shown and hidden;
- the rules grace period for a window that is not `NORMAL` when shown.

Add a case here for extension logic a fake window can drive. Anything reachable
this way must be verified this way before a shell is even considered; see the
hard rules in [RUNNING.md](RUNNING.md).

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

`WCTL_TEST_SETTLE` sets the settle wait before asserting (default 0.5 s); a
nested session needs `WCTL_TEST_SETTLE=1.5`. The multi-monitor cases skip unless
the session has two monitors (see [RUNNING.md](RUNNING.md) for faking one).

Assertions record a failure and return 0 (`tests/test-helper.sh`) — read the
suite summary, never an assertion's exit status.

`tests/test-helper.sh` holds the shared assertions (`assert_equals`,
`assert_within`, `assert_contains`, ...) and the test-window scaffolding the
state-changing suites share (`spawn_test_window`, `cleanup_test_window`,
`wait_for_change`, `get_window_field`). Reuse them rather than re-implementing
pass/fail logic or a window spawn in a suite. `tests/geometry-helper.sh` holds
the expected workarea parsing and tile geometry, plus `assert_tile_frame`, which
reads a window's frame once and asserts all four edges: it is an independent
oracle, and the same pixels are pinned by hand in the crate's unit tests, so the
two cannot drift silently.

## Adding a suite

1. Name it `tests/test-<topic>.sh` and `chmod +x` it — the query runner globs
   executable `test-*.sh` files.
2. Source `tests/test-helper.sh` (plus `tests/geometry-helper.sh` for geometry).
3. End with `summary()` — the runners scrape its `Passed:` count, and a suite
   without it contributes zero passes.
4. A state-changing suite MUST be added to the `MODIFICATION_TESTS` array in
   `tests/run-all-modification-tests.sh` AND to the exclusion list in
   `tests/run-all-query-tests.sh`, or it runs in the read-only query gate.

Examples: `tests/test-workspaces-monitors.sh` (query),
`tests/test-modifications.sh` (modification).

## Minimum checks before a PR

| Action | `mise run ci` | Rules grammar | Fake windows | Query | Modification |
|--------|---------------|---------------|--------------|-------|--------------|
| Before commit | **MUST pass** | **MUST pass** | **MUST pass** | **MUST pass** | Optional |
| Before push | **MUST pass** | **MUST pass** | **MUST pass** | **MUST pass** | Optional |
| Before release | **MUST pass** | **MUST pass** | **MUST pass** | **MUST pass** | **MUST pass** |

The rules-grammar column applies to any change under
`window-control@carlo9890.github.io/rules-format.js`, `cli/src/rules.rs` or
`tests/vectors/`. The fake-windows column applies to any change to
`extension.js`, `rules.js`, `keybindings.js` or `window-helpers.js`. Both are
headless and take seconds, so there is no reason to skip them.

Modifying JavaScript also requires `./scripts/build.sh validate` (see
[CODING.md](CODING.md)) and an actual reload-and-run in a shell (see
[RUNNING.md](RUNNING.md)).
