# Changelog

## v9 (2026-09-03)

### Changed
- `wctl` is now a Rust binary (crate in `cli/`, D-Bus via zbus) instead of a
  bash script. The CLI contract is unchanged: same commands, same output, same
  usage text, same exit codes. What changes is that it is faster and has no
  runtime dependencies -- `jq`, `busctl` and `gdbus` are no longer needed to run
  it, and the release asset is a statically linked x86_64 binary.
  Measured against the bash client on a GNOME 46 desktop session with 20
  windows, median of 21 runs each: `list` 11.7 ms to 1.8 ms, `list --json`
  6.9 ms to 1.7 ms, `focused` 12.8 ms to 1.6 ms, `info` 8.3 ms to 1.6 ms,
  `help` 2.5 ms to 0.8 ms. `wctl list` is now faster than a bare `gdbus call`
  (2.3 ms). The floor is process startup: `/bin/true` is 0.70 ms on the same
  machine, and the D-Bus work itself is about 0.3 ms per call.
- `wctl focused` now exits 1 when the extension is not running. The bash client
  called `die` inside a command substitution, which only exited the subshell, so
  it printed the error and then "No window focused" and exited 0.
- Shell completions no longer shell out to `jq` to list window IDs.
- The D-Bus error text for a method the loaded extension does not have now
  carries the error name (`org.freedesktop.DBus.Error.UnknownMethod: No such
  method "X"`) where gdbus printed `Call failed: No such method "X"`. Same exit
  code, same cause.
- The Rust toolchain is pinned in `.mise.toml`; `mise run ci` is the gate
  (`cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`, release build).
  The headless bash suite `tests/test-logic.sh` is gone; its 138 cases are now
  unit tests in the crate and argument-guard tests in `cli/tests/cli.rs`.

### Added
- Workspace control: D-Bus methods `ListWorkspaces`, `ActivateWorkspace`, and
  `MoveToWorkspace`; `wctl workspaces [--json]`, `wctl workspace <N>`, and
  `wctl move-to-workspace <WINDOW> <N>`. `ActivateWorkspace` hides the
  Activities overview before switching, because `Meta.Workspace.activate()`
  leaves the active workspace unchanged while the overview is shown (verified
  on GNOME 46), and it returns whether the switch actually took effect.
- Monitor control: D-Bus method `MoveToMonitor`; `wctl monitors [--json]` (over
  the existing `ListMonitors`) and `wctl move-to-monitor <WINDOW> <N>`.
- Window selectors: every `wctl` command that took an `<ID>` now also accepts
  `focused`, `-c <CLASS>`, `-t <TITLE>`, `-s <SUBSTR>`, or `-p <PID>`. A selector
  must match exactly one window; on ambiguity `wctl` lists the candidates and
  exits 1. A numeric ID still makes no extra D-Bus call, and a match selector
  costs one `ListDetailed` call that the command reuses. `wctl activate` keeps
  its first-match behaviour.
- `wctl wait -c|-t|-s|-p <VALUE> [--timeout <SECONDS>]` prints the ID of the
  matching window as soon as it is shown (default timeout 10 s, exit 1 on
  timeout). Backed by the new async D-Bus method `WaitForWindow(ssi) -> t`,
  which defers its reply until a matching window has been mapped and placed by
  mutter, so there is no polling and the shell main loop is never blocked. It
  deliberately does not reply at `window-created`: a geometry request on a
  window that exists but is not yet shown is overridden by mutter's initial
  placement, which is exactly the "launch, then place" script this command is
  for. Pending calls fail with
  `org.gnome.Shell.Extensions.WindowControl.Disabled` when the extension is
  disabled.
- `wctl list` filters: `--workspace <N>` (sticky windows included), `--monitor
  <N>`, `--class <CLASS>`; they apply to the table and to `--json`.
- Shell completions (bash and zsh) cover the new commands and selector options.
- `WCTL_TEST_SETTLE` sets the modification suite's settle time (default 0.5 s),
  so a nested session no longer needs a hand-edited copy of the suite.
- `scripts/release.sh` accepts the `static-pie linked` that the musl target
  actually produces. The gate matched only `statically linked`, so the first
  release of the Rust CLI would have aborted after a successful build. Its
  documented bump steps now also cover `version-name` and `cli/Cargo.lock`.
- A failing assertion no longer aborts a shell suite. The helpers run under
  `set -euo pipefail`, so returning non-zero killed the script at the first
  failure — skipping every later case and the suite's own diagnostics, and
  leaving the runner reporting "no tests executed" instead of a failure.

### Fixed
- `wctl info --json <WINDOW>` works again. The rewrite resolved the window
  selector from the first argument, so `--json` before it was rejected as an
  unknown option, although the bash client accepted either order and the
  rewrite's own note claimed the CLI contract was unchanged. `wctl focus -1`
  also reported `Unknown option: -1` where the bash client said `Window ID must
  be a number`; a negative number is a bad ID, not an option.
- `move-to-workspace` no longer claims a move mutter refused. `MoveToWorkspace`
  returned true whenever `change_workspace_by_index()` did not throw, but that
  function returns void and declines silently for a window held on all
  workspaces — which, with the GNOME default `workspaces-only-on-primary`, is
  every window on a secondary monitor. The workspace is now read back, and
  `wctl` names that cause instead of blaming a missing window or workspace.
- `wctl` no longer dies with SIGABRT and a Rust panic dump when its output pipe
  closes early (`wctl list --json | head`). Rust ignores SIGPIPE, turning the
  write into an EPIPE panic, and `panic = "abort"` made that an abort; the
  default disposition is now restored at startup, as the bash client had.
- Every `wctl` command now has a 25 s D-Bus reply timeout. zbus applies none by
  default, so a shell that was on the bus but wedged hung wctl forever, where
  gdbus and busctl both gave the bash client 25 s. `wait` keeps its own longer
  bound so a long `--timeout` is not cut short.
- `list --workspace` / `--monitor` no longer ignore an index too large for i64.
  The parse fell back to "no filter", so `--workspace 99999999999999999999`
  listed every window and exited 0.
- A control character in a window title can no longer break `wctl list`. Titles
  are arbitrary client text, and a newline split the row, so `wctl list | wc -l`
  over-counted and the first field of the extra line was not a window ID. jq's
  `@tsv` had escaped these for the bash client.
- `WaitForWindow` no longer writes its unvalidated `kind` argument to the
  journal. It was logged before being checked against the four keywords, so any
  process on the session bus could write arbitrary text, newlines included, into
  a log that outlives it.
- `WaitForWindow` no longer misses a window whose title or class changes after
  it is already on screen (`wait -t 'Report.pdf - LibreOffice Writer'` against an
  open LibreOffice), no longer drops the tracking that a second concurrent
  waiter still needs, no longer treats a window created on another workspace or
  created minimized as already shown, and no longer answers twice on one
  invocation when registration fails.
- `move`, `resize`, `move-resize`, `place`, `tile` and `center` now also refuse a
  window that is maximized on one axis. A side-by-side tiled window reports
  exactly that, and mutter overwrites its geometry outright, so testing only for
  a fully maximized window let the second most common window state through.
- `move`, `resize`, `move-resize`, `place`, `tile` and `center` no longer report
  success when nothing moved. Mutter drops a frame geometry request on a fully
  maximized or fullscreen window, but `Move`/`Resize`/`MoveResize` ran it anyway
  and returned true, so `wctl` printed "Window moved" and exited 0 while the
  window stayed put -- a caller could not detect it. The three handlers now
  refuse a pinned frame, and `wctl` says which state is in the way and how to
  clear it (`Window 123 is maximized; run 'wctl unmaximize 123' first`) instead
  of the misleading "Window not found". A window maximized on only one axis is
  untouched: it still honours the other axis, so refusing it would report a
  failure that did not happen.
- `wctl wait` no longer times out on a window that was created in the moment
  before the call. `WaitForWindow` matched an existing window only if it was
  already shown, and installed its tracking from `window-created` -- so a window
  that had been created but had not yet committed its first buffer fell through
  both and was never re-evaluated, and the wait ran to its timeout even though
  the window appeared moments later. That is exactly the "launch, then wait"
  case the command exists for. Such windows are now tracked when the waiter
  registers.
- WM classes no longer reach the journal. The v8 pass that removed window titles
  from the log left four lines that still interpolated a class: the three
  `ActivateByWmClass()` lines, where it is the caller-supplied match value, and
  `GetFocused()`, where it is content read off the focused window. Both are now
  logged as method name and outcome only. The logging invariant in
  `extension.js`, `docs/CODING.md` and `docs/MONITORING.md` now names WM class
  explicitly, and records why `WaitForWindow` may keep logging its `kind`.

## v8 (2026-09-02)

### Changed
- **BREAKING:** The extension UUID is now `window-control@carlo9890.github.io`
  (was `window-control@hko9890`). extensions.gnome.org requires the part after
  `@` to be a domain the author controls. The extension directory, the built zip
  name, and the argument to `gnome-extensions enable` all change with it.
  Existing users must disable and uninstall the old UUID by hand — see
  "Upgrading from window-control@hko9890" in README.md.

### Added
- `metadata.json` gained `url` and `version-name`, and the `description` now
  states what the extension registers on D-Bus and that the interface has no
  access control.
- SPDX license headers in `extension.js` and `dbus-interface.js`; a copy of
  `LICENSE` now ships inside the extension zip.

### Fixed
- Window titles no longer reach the journal. Per-call D-Bus handler logging moved
  from `console.log()` to `console.debug()` (42 calls), and the seven messages
  that interpolated a window title or a caller-supplied match string now log only
  the method name and outcome. GJS maps `console.log()` to journald priority 5
  (notice), which is visible without `G_MESSAGES_DEBUG` — so every `wctl` call
  was appending window titles to a log that outlives the session. The
  enable/disable lifecycle lines stay at `console.log()`; they carry no window
  content and fire twice per session.
- `docs/MONITORING.md` claimed `console.log()` maps to DEBUG and is "filtered
  out". It does not, and it is not. The level table is corrected against measured
  journald priorities, with the command to reproduce it.

## v7 (2026-07-12)

### Added
- Extended GNOME Shell compatibility to cover all currently released versions: added `48`, `49`, and `50` to `shell-version` (previously `45`-`47`)
- `wctl tile` and `wctl center` now offer shell completion (bash and zsh)
- Headless test coverage (`tests/test-logic.sh`): tile-grid geometry (incl.
  workarea width not divisible by 4), placement boundaries (negative / >100%),
  `resize 0`, near-miss workarea parsing, and a command-inventory drift guard
- CI runs `node --check` on all extension JS as a gate; `build.sh validate` does
  the same locally

### Fixed
- Made the maximize/unmaximize code path compatible with GNOME 49+, which removed the `Meta.MaximizeFlags` argument from `Meta.Window.maximize()`/`unmaximize()` and removed `get_maximized()` (now uses `get_maximize_flags()`/`is_maximized()`). A single `extension.js` runs on GNOME 45-50 via runtime API detection.
- `ListDetailed`'s `appears_focused` field now reads the distinct
  `win.appears_focused` property (a GObject property, accessed without parens)
  instead of calling it as a method, which threw and crashed the whole handler
  (breaking `wctl list --json`, `info`, and `focused --json`)
- `wctl resize`/`move-resize` now reject a width or height of `0` (the validator
  previously accepted `0` despite the "must be a positive number" message)
- `List` D-Bus method returns an empty array `[]` (not `[[]]`, a phantom
  zero-field window) on error, matching `ListDetailed`/`ListMonitors`
- `wctl` no longer reports "Window not found" with two different wordings; all
  commands report `Window not found: <id>`, and the "extension not running" hint
  is now emitted consistently across both D-Bus transports

### Changed
- Extracted the D-Bus interface XML into `window-control@hko9890/dbus-interface.js`
- Deduplicated `wctl` (shared `report_result`/`validate_id`/`cmd_bool_state`
  helpers; `tile`/`center` geometry as pure, unit-tested functions) and
  `extension.js` (shared `_actOnWindow` helper for the simple handlers)
- Modification tests assert geometry within a pixel tolerance instead of
  accepting any non-empty result; the standalone `scripts/test-tile-center.sh`
  harness was removed, its tile/center geometry checks folded into
  `tests/test-modifications.sh` (verified against the canonical geometry helpers)
  and its axis/usage guards into the headless `tests/test-logic.sh`
- Query/modification runners now report "no tests executed" as SKIPPED rather
  than a false pass

### Documentation
- Restructured the developer docs to the canonical topic layout: `AGENTS.md` is a
  routing layer, `docs/OVERVIEW.md` is the architecture/findability map, and topic
  guides live under `docs/` (CODING, TESTING, RUNNING, MONITORING, RELEASING,
  CHANGE-WORKFLOW); `README.md`/`CONTRIBUTING.md` route to them instead of
  restating, so each procedure has one canonical home
- Reconciled the project-structure trees, documented the headless CI-gate test
  suite and the `0.N.0 ↔ vN` version mapping, filled in the packaged extension
  README's usage section, and clarified the tiling non-goal

## v6 (2026-03-23)

### Added
- Added `wctl place <ID> <X> <Y> <WIDTH> <HEIGHT>` for workarea-relative window placement
- Added support for alignment keywords (`left|center|right`, `top|center|bottom`) and percentage sizes in `wctl place`

### Changed
- Reused shared window/workarea lookup helpers in `wctl` for placement and positioning commands
- Extended shell completion and help output to cover the new `place` command

### Testing
- Added modification-test coverage for `wctl place`
- Updated help tests and verified query tests, modification tests, and build validation

## v5 (2026-01-18)

### Added
- `ListMonitors` D-Bus method for enumerating monitors
- `GetWorkarea` D-Bus method for querying a monitor's usable work area
- `wctl tile` and `wctl center` commands for grid tiling and centering

### Fixed
- Missing closing brace in the `ListDetailed` method

### Testing
- Added coverage for the `tile` and `center` commands

### Tooling
- Added `scripts/release.sh` with wctl/metadata version validation and GitHub-releases install docs

## v4 (2026-01-09)

### Fixed
- Fixed `wctl list --json` and `wctl info --json` GVariant parsing issues
- Fixed table formatting with proper unicode alignment in `wctl list`
- Aligned output labels in `wctl info` and `wctl focused` commands

### Changed
- Removed unsupported `to-monitor` command from wctl CLI
- Refactored to use `busctl --json` for stable JSON output
- Refactored `cmd_focused` and `cmd_info` to use single jq calls

### Documentation
- Added test requirements to CONTRIBUTING.md
- Improved test runners to separate query and modification tests

## v3 (2026-01-08)

### Changed
- Updated `install-wctl.sh` to support downloading `wctl` from GitHub releases
- Added an initial release script

## v2 (2026-01-08)

- Initial tagged release of the extension and `wctl` CLI
