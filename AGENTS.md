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
under `window-control@carlo9890.github.io/`, `cli/`, `scripts/` or `tests/`.**
It owns the JS and Rust style rules, the mandatory `node --check` gate, and the
recipe for adding a D-Bus method end to end.

### Documentation changes

**MUST load the `instruction-writing:writing-project-docs` skill before creating
or editing ANY `*.md` file in this repository.** It owns which file holds which
content and how a doc is written; this repository has no local delta over it.

### The rules.json auto-placement format

**MUST read [docs/specs/RULES-JSON.md](docs/specs/RULES-JSON.md) before editing
`rules-format.js`, `rules.js`, `cli/src/rules.rs` or `tests/vectors/`, or
changing what the rules file accepts or how a rule is applied.** It is the
normative format: the key set, the token grammar, the tile grid, every
validation message, and the show/unmaximize timing a placement depends on.

Two implementations follow it — the extension's `rules-format.js` and the CLI's
`cli/src/rules.rs` — pinned to each other by
`tests/vectors/rules-spec.json`. Change the spec, both sides and the vectors in
**one commit**, or the other side's CI gate fails.

### Testing and verification

**MUST read [docs/TESTING.md](docs/TESTING.md) before writing a test, and before
your first `mise run test`, `mise run ci`, or `./tests/run-all-*.sh`
invocation.** It owns the test layers, the CI gate, and the minimum checks per
action.

### Run the extension to reproduce a bug or verify a change

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before reloading or driving the
extension by hand.** It owns the reload path, the nested-session setup, and the
pitfalls that cost hours when met blind. **Starting, killing, or restarting any
GNOME Shell, nested included, needs the user's explicit consent for that
specific run.** A nested start once logged the user out of the real session;
the hard rules at the top of RUNNING.md are not negotiable.

### Analyze logs

**MUST read [docs/MONITORING.md](docs/MONITORING.md) before your first
`journalctl` or other log-reading command against the extension** — where the
lines land, which levels are visible, and what a silent no-op means.

### Commit, branch, PR workflow

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git
operation** — commit, branch, worktree, push, or opening a PR.

### Release

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before cutting a release** or
changing what the project ships.
