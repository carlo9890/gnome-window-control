# Changelog

## Unreleased

### Changed
- `wctl` is now a Rust binary (crate in `cli/`, D-Bus via zbus) instead of a
  bash script. The CLI contract is unchanged: same commands, same output, same
  usage text, same exit codes. What changes is that it is faster and has no
  runtime dependencies -- `jq`, `busctl` and `gdbus` are no longer needed to run
  it, and the release asset is a statically linked x86_64 binary.
  Measured on GNOME 46 against the bash client: `wctl list` 10.2 ms to 2.4 ms,
  `wctl focused` 15.8 ms to 2.3 ms. The floor is process startup; the D-Bus work
  itself is about 0.3 ms per call.
- `wctl focused` now exits 1 when the extension is not running. The bash client
  called `die` inside a command substitution, which only exited the subshell, so
  it printed the error and then "No window focused" and exited 0.
- Shell completions no longer shell out to `jq` to list window IDs.
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

### Changed
- `wctl info` now requires the window selector before `--json`
  (`wctl info <WINDOW> [--json]`).

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
