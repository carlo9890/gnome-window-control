# AGENTS.md — gnome-window-control routing

## Repository purpose

A GNOME Shell extension exposing a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a CLI over that interface. Extension code is
GJS; the CLI is Rust (crate in `cli/`); targets GNOME Shell 45-50.

## Use-case routing

Every route below is mandatory, not advisory. Load the document BEFORE the first
action of that kind — loading it afterwards does not count, and no route becomes
skippable because the task looks small.

### Research, planning, analysis

**MUST read [docs/OVERVIEW.md](docs/OVERVIEW.md) before searching this repository.**
It is the map — layout, architecture, the D-Bus and selector concepts, and the
expressions that locate a method or a command fast.

### Coding and file changes

**MUST read [docs/CODING.md](docs/CODING.md) before creating or editing ANY file
under `window-control@carlo9890.github.io/` or `cli/`.** It owns the JS and Rust
style rules, the mandatory `node --check` gate, and the recipe for adding a D-Bus
method end to end.

### Testing and verification

**MUST read [docs/TESTING.md](docs/TESTING.md) before writing a test** or judging
whether a change is verified. It owns the test layers, the CI gate, and the
minimum checks per action.

### Run the extension to reproduce a bug or verify a change

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before reloading or driving the
extension by hand.** It owns the reload path, the nested-session setup, and the
pitfalls that cost hours when met blind.

### Analyze logs

**MUST read [docs/MONITORING.md](docs/MONITORING.md) before interpreting the
extension's log output** — where the lines land, which levels are visible, and
what a silent no-op means.

### Commit, branch, PR workflow

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git
operation** — commit, branch, push, or opening a PR.

### Release

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before cutting a release** or
changing what the project ships.
