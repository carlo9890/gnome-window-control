# AGENTS.md — gnome-window-control routing

## Repository purpose

A GNOME Shell extension that lists and controls windows on Wayland over D-Bus,
and `wctl`, a Rust CLI (`cli/`) over that interface.

## Use-case routing

Every route below is **mandatory, not advisory**. Load the document BEFORE the
first action of that kind — loading it afterwards does not count, and no route
becomes skippable because the task looks small.

### Research and planning

**MUST read [docs/OVERVIEW.md](docs/OVERVIEW.md) before your first search or
file Read in this repository.** One method spans the D-Bus XML, its handler and
its `wctl` command, and no name links the three.

### Coding

**MUST read [docs/CODING.md](docs/CODING.md) before editing ANY file under
`window-control@carlo9890.github.io/`, `cli/`, `scripts/`, `tests/` or
`.github/workflows/`, or `install-wctl.sh` or `.mise.toml`.** No compiler checks
the GJS code.

### Decisions in force

**MUST read the records in [docs/decisions/](docs/decisions/) that bear on the
change before editing a file under `window-control@carlo9890.github.io/`,
`cli/` or `tests/`, or `scripts/release.sh`, `scripts/check-static.sh`,
`.mise.toml` or `.github/workflows/build.yml`.** A change against a record is
the user's call: name the record and ask.

### Writing docs

**MUST call the Skill tool with `instruction-writing:writing-project-docs` AND
read [docs/DOCUMENTING.md](docs/DOCUMENTING.md) before editing ANY `*.md`
file.** Each doc tree has its own owner and reader.

### Testing

**MUST read [docs/TESTING.md](docs/TESTING.md) before writing a test, before
your first `mise run`, `gjs -m tests/…` or `./tests/*.sh`, and before you report
a change as verified.** Some suites move windows and press keys.

### Running the extension by hand

**MUST read [docs/RUNNING.md](docs/RUNNING.md) before `./scripts/build.sh
install` or `install-zip`, `gnome-extensions`, `wctl`, `gdbus call`,
`./scripts/start-*.sh` or `./scripts/demo/record.sh`, and before you start, kill or restart any GNOME Shell.** Each start needs the
user's consent; a wrong start can log the user out.

### Git

**MUST read [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) before ANY git
command that writes.** It sets the test bar for a commit, and only the
maintainer merges.

### Reviewing

**MUST read [docs/REVIEWING.md](docs/REVIEWING.md) before you invoke a review
skill or read a diff under review.** No tool checks the extensions.gnome.org
review rules.

### Releasing

**MUST read [docs/RELEASING.md](docs/RELEASING.md) before tagging, before
editing `metadata.json`, the `version` in `cli/Cargo.toml`, `install-wctl.sh`,
`.gitignore`, `scripts/build.sh`, `scripts/release.sh`, `scripts/check-*.sh` or
the `build:musl` task, and before adding or removing a tracked file in the
extension directory.** The zip ships the tracked files.
