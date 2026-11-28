# Testing

```bash
mise run ci                                              # the crate gate: fmt, clippy, tests, build, cargo audit
env -u GI_TYPELIB_PATH gjs -m tests/check-rules-format.js   # rules grammar, no typelib
env -u GI_TYPELIB_PATH gjs -m tests/check-prefs.js          # preferences logic
dir=$(find /usr/lib* -name 'Meta-*.typelib' -printf '%h\n' | sort -V | tail -1) &&
    GI_TYPELIB_PATH=${dir:?no Meta-*.typelib installed} gjs -m tests/check-extension-headless.js
./tests/check-dbus-doc-table.sh                          # the method table in docs/user-guide/dbus.md
./tests/run-all-query-tests.sh                           # read-only, against a running extension
./tests/run-all-modification-tests.sh                    # state-changing: headless shell or VM guest only
```

## Layers

| Layer | Suite | Needs a running extension |
|---|---|---|
| Crate (CI) | `cli/src/**` unit tests, `cli/tests/cli.rs` | No |
| Rules grammar (CI) | `tests/check-rules-format.js` against `tests/vectors/rules-spec.json` | No |
| Preferences (CI) | `tests/check-prefs.js` | No |
| Fake windows (CI) | `tests/check-extension-headless.js`: the real extension modules against a fake display | No, but the mutter typelib (`gir1.2-mutter-14` on Ubuntu 24.04) |
| Query | `tests/run-all-query-tests.sh` | Yes |
| Modification | `tests/run-all-modification-tests.sh`, `tests/test-keybindings.sh` included | Yes, in a headless shell or a VM guest |

Coverage is not measured. The minimum-checks table below is the whole bar.

## CI gate

`.github/workflows/build.yml` runs two jobs on a bare `ubuntu-latest`: `extension`
(the three headless `gjs` checks and the method-table check) and `cli` (`mise run ci` and the release
checks). Run the release checks locally before a push that changes a version or
a dependency:

```bash
./scripts/check-version.sh
./tests/check-version-refusals.sh
./tests/check-release-notes-path.sh
mise run build:musl
```

## Query and modification tests

The shell suites run the release binary `cli/target/release/wctl`: build it
first with `mise run build`. Set `WCTL` to test another binary:
`WCTL=$(command -v wctl) ./tests/run-all-query-tests.sh`.

- Run the modification runner only in a headless shell or a VM guest's session
  ([RUNNING.md](RUNNING.md)). It moves, focuses and closes windows, and the
  keyboard-shortcut suite injects keys over `org.gnome.Mutter.RemoteDesktop`
  into the shell that runs it.
- In a nested session, run `tests/test-modifications.sh` directly.
- The suites test the loaded extension. Against an older loaded build, a suite
  fails on "No such method" instead of skipping.
- Read the suite summary, never an assertion's exit status: an assertion records
  a failure and returns 0.
- Set `WCTL_TEST_SETTLE=1.5` in a nested or headless shell (default 0.5 s).

## Write a test

- Pin **hardcoded** expected values in Rust unit tests. Never recompute them
  with the implementation's own formula.
- Put a test that proves an argument is refused before any D-Bus call in
  `cli/tests/cli.rs`: it runs the binary against a bus that does not exist.
- Read every group of `tests/vectors/rules-spec.json` from both sides,
  `tests/check-rules-format.js` and `cli/src/rules.rs`, and give a new group a
  reader on each side in the same commit. The two exceptions are read by the
  GJS check only: the `pid` match cases (`rules.json` has no `pid` key) and
  `match.no_predicate` (the CLI builds no predicate from a bare kind).
- Add a case to `tests/check-extension-headless.js` for extension logic a fake
  window can drive. Each section opens with a comment that says what it pins.
- In the fake-windows check, stub a `Meta` function only in a case that runs an
  older mutter's path, as the below-50 `min_width` section does. For the
  current path, take the API away for the case, as `hideIsWayland()` does: a
  stub hides a call that throws on the real shell.
- Reuse the assertions and the window scaffolding of `tests/test-helper.sh`, and
  the tile geometry of `tests/geometry-helper.sh`. `assert_tile_frame` is an
  oracle independent of the crate, whose unit tests pin the same pixels by hand.

### Add a shell suite

1. Name it `tests/test-<topic>.sh` and make it executable: the query runner
   runs every executable `test-*.sh`.
2. Source `tests/test-helper.sh`, and `tests/geometry-helper.sh` for geometry.
3. End with `summary`: a runner reads its `Passed:` count.
4. Add a state-changing suite to `MODIFICATION_TESTS` in
   `tests/run-all-modification-tests.sh` AND to the exclusions in
   `tests/run-all-query-tests.sh`, or it runs in the read-only gate.

## Driving install-wctl.sh and release.sh offline

CI does not run either script end to end. After a change to one, run it with
stubs for `gh`, `mise` and `curl` first on `PATH`, and keep `git`, `sha256sum`
and the other local tools real.

- Set `HOME` to a scratch directory for `install-wctl.sh`: it installs to
  `$HOME/.local/bin`.
- Run `release.sh --notes-file <file>` only in a throwaway clone, on branch
  `main` with a clean tree and tag `v<metadata.json version-name>` on `HEAD`
  (`git tag -f`) first: it checks the tag, and writes `dist/` and
  `cli/target/` there.

- With `mise` stubbed, the static-linkage check of `mise run build:musl`
  never runs.
- `install-wctl.sh` calls `wget` only when no `curl` is on `PATH`: to test that
  path, stub `wget` and leave `curl` off `PATH`.

These stub answers are not obvious from the scripts:

- `gh release view <tag>` exits non-zero before `gh release create` (exit 0
  makes `release.sh` prompt on stdin), and exits 0 after it, printing `4` for
  `--json assets -q '.assets | length'`.
- `gh api repos/{owner}/{repo}/commits/tags/<tag> -q .sha` prints the `HEAD`
  commit, or `release.sh` stops before the build.
- `curl`, or `wget` with `-O`, for `install-wctl.sh --download`: write a
  runnable `wctl` to the output path, and print its `sha256sum` line when the
  output path is `-` (the `wctl.sha256` fetch).

## Minimum checks before a PR

| Action | `mise run ci` | Rules grammar | Preferences | Fake windows | Query | Reload-and-run | Modification |
|---|---|---|---|---|---|---|---|
| Before commit or push | MUST | MUST | MUST | MUST | MUST | MUST¹ | Optional |
| Before release | MUST | MUST | MUST | MUST | MUST | MUST | MUST |

¹ MUST pass, or record the skip in the PR when the user gives no consent for a
shell ([RUNNING.md](RUNNING.md#hard-rules)).

Which change brings in which column:

- Rules grammar: `rules-format.js`, `cli/src/rules.rs`, `tests/vectors/`.
- Preferences: `prefs.js`, `prefs/`, `rules-files.js`, the schema.
- Fake windows: `extension.js`, `dbus-service.js`, `rules.js`,
  `rules-files.js`, `overlay.js`, `keybindings.js`, `indicator.js`,
  `window-helpers.js`.
- Query: anything under `window-control@carlo9890.github.io/`, `cli/` or
  `tests/`. It reads the extension of the real session, which holds the old
  JavaScript until the user logs out and in.
- Reload-and-run: a JavaScript change. Reload it in a nested or headless shell
  or a VM guest ([RUNNING.md](RUNNING.md)) and run the query suite there.

A JavaScript change also passes the `node --check` gate in
[CODING.md](CODING.md). A change to `dbus-interface.js` or
`docs/user-guide/dbus.md` also passes `./tests/check-dbus-doc-table.sh`.
