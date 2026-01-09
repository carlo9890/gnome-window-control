# Changelog

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
