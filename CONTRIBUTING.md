# Contributing to GNOME Window Control

This file is the entry point for human contributors. It points to the doc that
owns each step. AI agents start from [AGENTS.md](AGENTS.md).

## Getting started

You need a GNOME Shell session on Wayland in a version that the `shell-version`
list of `window-control@carlo9890.github.io/metadata.json` names, the
`gnome-extensions` CLI, `node`, `gjs` and [mise](https://mise.jdx.dev). Run
`mise install` in the repository root for the pinned Rust toolchain.

1. Build from source and learn where code goes: see
   [docs/CODING.md](docs/CODING.md).
2. Run the tests: see [docs/TESTING.md](docs/TESTING.md).
3. Reload and drive the extension in a nested or headless shell, not in the
   session you work in: see [docs/RUNNING.md](docs/RUNNING.md).

## Before you open a PR

Follow [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md) for commits, branches
and the PR, and the rules in [docs/REVIEWING.md](docs/REVIEWING.md).

## Where things live

- Using the product: [docs/user-guide/](docs/user-guide/README.md)
- Finding your way around the source: [docs/OVERVIEW.md](docs/OVERVIEW.md)
- Reading the extension's logs: [docs/MONITORING.md](docs/MONITORING.md)
- Recording the demo GIFs again: the header of
  [scripts/demo/record.sh](scripts/demo/record.sh)
- Cutting a release: [docs/RELEASING.md](docs/RELEASING.md)

## Reporting issues

Give your GNOME Shell version (`gnome-shell --version`), your distribution, the
steps to reproduce, what you expected, what happened, and the log lines. Open an
issue before a large change, so we can agree on the approach first.

By contributing, you agree that your contributions are licensed under the MIT
License.
