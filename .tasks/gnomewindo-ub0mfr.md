---
id: gnomewindo-ub0mfr
title: Shell completions from the Rust wctl
status: open
type: feature
priority: 2
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-111jxs
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Bash reference: `cmd_completion_bash` and `cmd_completion_zsh` in `wctl`
(two heredocs, about 240 lines together), the `SHELL COMPLETION:` section of
the help text, and in `tests/test-logic.sh` the `bash -n` / `zsh -n` checks
plus the command-inventory drift guard that compares `local commands="..."`
in the bash completion, the `'name:desc'` entries in the zsh completion, and
the help text against one expected list. The scripts complete live window
IDs by running `wctl list --json | jq -r '.[].id'` and offer `focused -c -t
-s -p` where a `<WINDOW>` goes.

## Problem

`wctl completion bash|zsh` is part of the command surface and the suites
check it. Generated static completions (`clap_complete`) cannot run `wctl
list --json` for IDs, so they would lose the dynamic completion users have
today.

## Recommended action

Move the two scripts unchanged into `cli/completions/wctl.bash` and
`cli/completions/_wctl`, embed them with `include_str!`, and print them from
`wctl completion bash` and `wctl completion zsh`. `wctl completion` with no
shell dies `Usage: wctl completion <bash|zsh>`; an unknown shell dies `Unknown
shell: <name>. Supported: bash, zsh`. Replace the drift guard with a unit test
that extracts the command list from each embedded script and compares it with
the top-level subcommand names clap reports, so a command added to clap
without a completion entry fails `cargo test`. Add a test that pipes each
script through `bash -n` and, when `zsh` is on PATH, `zsh -n`.

The completion scripts call `wctl`, not `jq`, for the ID list once the
binary exists: change `_wctl_get_window_ids` and `_wctl_window_ids` to parse
`wctl list --json` without `jq` (for bash, `grep -o '"id":[0-9]*'` is enough),
so the installed binary has no `jq` dependency through its completions either.

## Acceptance criteria

- [ ] `cli/target/release/wctl completion bash | bash -n` and `cli/target/release/wctl completion zsh | zsh -n` exit 0
- [ ] `cargo test` includes the inventory test and fails when a subcommand is removed from either embedded script (verify once by hand and restore)
- [ ] `grep -n 'jq' cli/completions/*` prints nothing
- [ ] In a bash with the completion sourced and a window open, typing `wctl tile <Tab>` offers the window IDs and `focused`
