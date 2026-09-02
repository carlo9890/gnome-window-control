---
id: gnomewindo-w79bff
title: Pin the Rust toolchain with mise
status: open
type: chore
priority: 1
creator: hans
parent: gnomewindo-ypokef
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Repository root has no `.mise.toml` (`ls .mise.toml mise.toml .tool-versions`
prints nothing). `~/.config/mise/config.toml` pins every other tool on this
machine but has no `rust` entry, and `cargo --version` / `rustc --version`
fail with `command not found`. House style for a per-project pin:
`~/dev/github/task-manager-ui/.mise.toml` (exact version, e.g. `go = "1.26.3"`,
gates as `[tasks]`).

## Problem

Nothing in the repository can build Rust, and nothing tells an implementer
which toolchain the crate expects. Without a pin each machine and CI would
pick a different `rustc`, and `cargo clippy -D warnings` results would differ
between them.

## Recommended action

Add `.mise.toml` at the repository root with an exact pin of the current
stable release:

    mise ls-remote rust | grep -v beta | tail -1     # e.g. 1.xx.y

    [tools]
    rust = "1.xx.y"

Run `mise install` and `mise trust` if prompted. Do not add tasks yet; the
crate directory does not exist and the tasks are added with it. Add one line
to `CONTRIBUTING.md` under the build prerequisites: the Rust toolchain comes
from `mise install`.

## Acceptance criteria

- [ ] `.mise.toml` is committed with an exact `rust = "<version>"` pin, no `latest`
- [ ] `mise exec -- cargo --version` and `mise exec -- rustc --version` print the pinned version
- [ ] `mise exec -- cargo clippy --version` and `mise exec -- cargo fmt --version` succeed (the components ship with the default rustup profile; if they do not, add them and say how)
- [ ] `CONTRIBUTING.md` names `mise install` as the way to get the toolchain
