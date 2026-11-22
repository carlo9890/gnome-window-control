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

**MUST read [docs/OVERVIEW.md](docs/OVERVIEW.md) before your first `grep`, `rg`,
Glob, or file Read in this repository.** It is the map — layout, architecture,
the D-Bus and selector concepts, and the expressions that locate a method or a
command fast.

### Coding and file changes

**MUST read [docs/CODING.md](docs/CODING.md) before creating or editing ANY file
under `window-control@carlo9890.github.io/`, `cli/`, `scripts/` or `tests/`,
or `install-wctl.sh`, `.mise.toml` or a file under `.github/workflows/`.**
It owns the mandatory `node --check` gate, the build commands, the mechanisms a
handler or a command must use, and the recipe for adding a D-Bus method end to
end.

### Changing a decided design

**MUST read the records in [docs/decisions/](docs/decisions/) that bear on the
change before editing a file under `window-control@carlo9890.github.io/`,
`cli/` or `tests/vectors/`, or `tests/check-rules-format.js`,
`scripts/release.sh`, `scripts/check-static.sh`, `.mise.toml` or
`.github/workflows/build.yml`.** Each holds a decision in
force, and a change against one is the user's call — name the record and ask.

### Documentation changes

**MUST load the `instruction-writing:writing-project-docs` skill before creating
or editing ANY `*.md` file in this repository.** It owns which file holds which
content and how a doc is written.

**Local delta:** `docs/specs/` holds normative format specifications, one file
per format, outside the canonical topic set. A spec states what an
implementation MUST do.

### The rules.json auto-placement format

**MUST read [docs/specs/RULES-JSON.md](docs/specs/RULES-JSON.md) before editing
`rules-format.js`, `rules.js`, `cli/src/rules.rs` or `tests/vectors/`, or
changing what the rules file accepts or how a rule is applied.** It is the
normative format: the key set, the token grammar, the tile grid, every
validation message, and the show/unmaximize timing a placement depends on.

### Testing and verification

**MUST read [docs/TESTING.md](docs/TESTING.md) before writing a test, and before
your first `mise run test`, `mise run ci`, `gjs -m tests/…`, or `./tests/*.sh`
invocation.** It owns the test layers, the CI gate, and the minimum checks per
action.

### Run the extension to reproduce a bug or verify a change

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before your first
`./scripts/build.sh install` or `install-zip`, `gnome-extensions`, `wctl` or
`gdbus call` against the extension, `./scripts/debug-dbus.sh` or
`./scripts/start-*.sh`, and before starting,
killing, or restarting any GNOME Shell, nested and headless included.** It owns the reload path, the nested-session
setup, and the pitfalls that cost hours when met blind. **Hard rule 1 there
says which shell starts, kills and restarts need the user's consent.**

### Analyze logs

**MUST read [docs/MONITORING.md](docs/MONITORING.md) before your first
`journalctl` or other log-reading command against the extension** — where the
lines land, which levels are visible, and what a silent no-op means.

### Commit, branch, PR workflow

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git
operation** — commit, branch, worktree, push, or opening a PR.

### Reviewing changes

**MUST read [docs/REVIEWING.md](docs/REVIEWING.md) before you start a review
skill, and before your first `gh pr view`, `gh pr diff` or `git diff` read to
review a PR or a local change.** It carries the quality rules a finished change is held to — the
extensions.gnome.org review guidelines, the SPDX header, log levels and log
content.

### Release

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before cutting a release, and
before editing `metadata.json`, the `version` in `cli/Cargo.toml`,
`scripts/build.sh`, `scripts/release.sh`, `scripts/check-version.sh`,
`install-wctl.sh` or `.gitignore`, and before adding or removing a tracked file
under `window-control@carlo9890.github.io/`.**
