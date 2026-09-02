---
id: gnomewindo-7w035h
title: 'Cut over: delete the bash wctl and point tests, CI and docs at the crate'
status: open
type: chore
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-zr8nrl
  - gnomewindo-ub0mfr
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Sites that still assume the bash script once the crate implements every
command:

- `wctl` (the script itself) and `tests/test-logic.sh` (sources it; its cases
  are ported into `cargo test` by the crate slices).
- `tests/test-helper.sh:19`, default `WCTL` path.
- `.github/workflows/build.yml`: step `Run pure-logic tests` (`chmod +x wctl;
  bash tests/test-logic.sh`), step `Upload wctl artifact` (`path: wctl`), and
  `wctl` in both `paths:` lists.
- `tests/run-all-query-tests.sh` runs every `tests/test-*.sh`, so it executes
  `test-logic.sh` until that file is gone.
- Docs: `docs/CODING.md` (section `Bash style (wctl)`, and steps 3-4 of
  `Adding a new D-Bus method`), `docs/TESTING.md` (`Pure-logic tests (the CI
  gate)` and the layers table), `docs/OVERVIEW.md` (repository layout line
  for `wctl`, the "two client transports" bullet, the `wctl` greps under
  `Finding things`), `AGENTS.md` (`the CLI is bash`), `README.md` (`wctl CLI
  Wrapper (Optional)` install section), `CONTRIBUTING.md`.

## Problem

Two implementations of the same CLI in one repository, with CI still gating
on the bash one, is the state in which the next change updates one and not
the other. The epic's outcome is one binary and no bash.

## Recommended action

Delete `wctl` and `tests/test-logic.sh`. Set the default in
`tests/test-helper.sh` to `cli/target/release/wctl`, keeping the `WCTL`
override. In `build.yml` drop the two bash steps, upload
`cli/target/release/wctl` as the `wctl` artifact from the `cli` job, and
replace `wctl` in the `paths:` lists with `cli/**` and `.mise.toml`. Rewrite
the doc sections above for the crate: `cargo fmt`, `cargo clippy -D
warnings`, module layout, "add a method to the proxy trait and a subcommand"
in the D-Bus recipe, `cargo test` as the headless gate, `mise run ci` as the
pre-handoff gate, and the install section pointing at the binary. Behaviour
does not move: no test assertion in the seven live suites changes.

Out of this chore: the release script and the installer (next chore).

## Acceptance criteria

- [ ] `test ! -f wctl && test ! -f tests/test-logic.sh`
- [ ] `grep -rn 'test-logic\|busctl\|gdbus call' --include='*.sh' --include='*.md' --include='*.yml' . | grep -v CHANGELOG` prints nothing (the RUNNING.md `gdbus call` examples for driving the extension by hand may stay; list them in a comment if kept)
- [ ] `git diff --stat main -- tests/test-*.sh` shows only `tests/test-helper.sh` and the deleted `tests/test-logic.sh`
- [ ] `./tests/run-all-query-tests.sh` and `./tests/run-all-modification-tests.sh` are green with no `WCTL` override set
- [ ] The `cli` CI job passes on the PR and the old `Run pure-logic tests` step is gone from the workflow log
