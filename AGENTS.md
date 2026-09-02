# AGENTS.md — gnome-window-control routing

## Repository purpose

A GNOME Shell extension exposing a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a CLI over that interface. Extension code is
GJS; the CLI is Rust (crate in `cli/`); targets GNOME Shell 45-50.

## Use-case routing

Depending on your goal, load the relevant document first.

### Research, planning, analysis

Load [docs/OVERVIEW.md](docs/OVERVIEW.md) for the architecture, repository layout,
and search expressions for finding things.

### Coding and file changes

Load [docs/CODING.md](docs/CODING.md) before changing code — style, the mandatory
`node --check` gate, building, and the recipe for adding a D-Bus method.

### Testing and verification

Load [docs/TESTING.md](docs/TESTING.md) for the test suites and CI gates.

### Run the extension to reproduce a bug or verify a change

Load [docs/RUNNING.md](docs/RUNNING.md) to reload and drive the extension by hand —
`disable`/`enable` does **not** reload JS from disk, so code changes need a shell
restart or nested session.

### Analyze logs

Load [docs/MONITORING.md](docs/MONITORING.md) for viewing logs, log levels, and
interpreting common signals.

### Commit, branch, PR workflow

Load [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before git operations or
opening a PR.

### Release

Load [docs/RELEASING.md](docs/RELEASING.md) to cut a release. Releases MUST use
`./scripts/release.sh`.

### Requirements / design spec

`gnome-window-control-extension-requirements.md` is the original design spec. The
authoritative D-Bus surface is the interface XML in
`window-control@carlo9890.github.io/dbus-interface.js` and the method table in
[README.md](README.md).
