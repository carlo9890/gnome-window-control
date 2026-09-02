---
id: gnomewindo-ypokef
title: Replace the bash wctl with a Rust zbus binary
status: open
type: epic
priority: 1
creator: hans
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Repository `/home/hans/dev/github/gnome-window-control`, `main` at 83d1341.
`wctl` is a 1,225-line bash script (30 `cmd_` functions, `VERSION="0.8.0"` at
line 26) over the D-Bus interface `org.gnome.Shell.Extensions.WindowControl`
at `/org/gnome/Shell/Extensions/WindowControl` on destination `org.gnome.Shell`
(29 methods, XML in `window-control@carlo9890.github.io/dbus-interface.js`).

It reaches the bus through two transports, `gdbus` for scalar replies and
`busctl --json | jq` for the three JSON-string replies, because `gdbus` mangles
the JSON string. Replies are parsed from GVariant text with regexes
(`parse_uint64_reply`, `parse_workarea_rect`), and caller strings pass through
`gdbus`'s argument parser. Runtime dependencies: bash, gdbus, busctl, jq,
column.

Decision taken 2026-09-02 after an analysis of a rewrite: replace the script
with a Rust binary using zbus. Speed is the smaller reason (baseline on this
machine, GNOME 46: `wctl list` 9 ms, `info` 9 ms, `focused` 14 ms,
`tile` 16 ms, a raw `gdbus call` 3 ms). The larger reasons are removing the
text parsing of D-Bus replies and the five runtime dependencies.

## Outcome

A user installs one static `wctl` binary and needs nothing else on the
machine. Every command, option, output line and exit code is the same as the
bash script's, so existing scripts and the live test suites keep working
unchanged. The bash script, its headless logic suite and the `jq`/`busctl`
transports are gone from the repository.

## Success criteria

- [ ] `./install-wctl.sh --download` on x86_64 installs a binary for which `ldd ~/.local/bin/wctl` prints `not a dynamic executable`, and `PATH=$(dirname "$(command -v wctl)") wctl list` works with `jq`, `busctl` and `gdbus` absent from PATH
- [ ] `./tests/run-all-query-tests.sh` and `./tests/run-all-modification-tests.sh` are green against the installed binary in a live (non-nested) GNOME session, with no test assertion changed to make them pass
- [ ] Median of 10 runs in a live session: `wctl list` at most 4 ms and `wctl tile <id> left` at most 6 ms (baseline 9 ms and 16 ms), recorded as a comment on this epic
- [ ] `test ! -f wctl && test ! -f tests/test-logic.sh` holds on `main`, and `grep -rln 'busctl\|jq ' --include='*.sh' --include='*.md' . | grep -v CHANGELOG` prints nothing
- [ ] The next release (`./scripts/release.sh`) attaches the binary as the asset named `wctl`, and `wctl --version` on it prints the `0.N.0` form matching the release tag `vN`

## Constraints

State these once so no child re-decides them:

- Crate lives at `cli/` (package and binary both named `wctl`), because the
  root file `wctl` occupies that name until the cutover.
- zbus blocking API only. No tokio or other async runtime in the binary.
- The bus connection is opened lazily, on the first command that needs it.
  Argument validation happens before that, so `cargo test` and CI (no session
  bus) can exercise every usage error.
- No C dependencies; the published binary is a static `x86_64-unknown-linux-musl`
  build.
- The CLI contract is frozen: command names, option letters, every output
  string, table headers, exit codes. The seven live suites under `tests/` are
  the acceptance tests; they run the binary through `$WCTL`.
- Toolchain comes from mise (`.mise.toml` in the repo, exact version pin, gates
  as mise tasks), like the other repositories on this machine.
- `cli/Cargo.toml` `version` is the `0.N.0` form and mirrors `metadata.json`
  `version` N (docs/RELEASING.md, "Version format").

## Children

- [chore] Pin the Rust toolchain with mise
- [task] Spike: measure a zbus blocking client against the extension
- [feature] Rust wctl crate with list, focused, info, help and version, gated in CI
- [feature] Window selectors and list filters in the Rust wctl
- [feature] workspaces, monitors and wait in the Rust wctl
- [feature] Geometry and tiling commands in the Rust wctl
- [feature] State, activation, workspace and monitor move commands in the Rust wctl
- [feature] Shell completions from the Rust wctl
- [chore] Cut over: delete the bash wctl and point tests, CI and docs at the crate
- [chore] Release and install path for the wctl binary (x86_64)
- [task] Verify the Rust wctl in a live session and record timings

## Not in this epic

- aarch64 binaries. Out of scope for the first release; pick up when a user
  asks, as a cross build in `scripts/release.sh`.
- `wctl launch` (place a window before its first frame). Separate epic; needs
  extension work, not CLI work.
- Any change to what the CLI prints or returns, e.g. moving `Window not found`
  from stdout to stderr. File as its own issue after the cutover.
- Generated static completions via `clap_complete`. The hand-written scripts
  complete live window IDs; they are kept.
- Changes to the extension. The D-Bus interface stays as it is.
