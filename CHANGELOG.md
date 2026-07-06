# Changelog

## v7 (2026-07-05)

### Added
- Extended GNOME Shell compatibility to cover all currently released versions: added `48`, `49`, and `50` to `shell-version` (previously `45`-`47`)

### Fixed
- Made the maximize/unmaximize code path compatible with GNOME 49+, which removed the `Meta.MaximizeFlags` argument from `Meta.Window.maximize()`/`unmaximize()` and removed `get_maximized()` (now uses `get_maximize_flags()`/`is_maximized()`). A single `extension.js` runs on GNOME 45-50 via runtime API detection.

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
