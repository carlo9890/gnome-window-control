# Contributing to GNOME Window Control

Thanks for helping improve this project. This is the human contributor's front
door — it points you to the right doc rather than repeating it. (AI agents start
from [AGENTS.md](AGENTS.md) instead.)

## Getting started

1. Fork and clone, then branch from `main`:
   ```bash
   git clone https://github.com/YOUR-USERNAME/gnome-window-control.git
   cd gnome-window-control
   git checkout -b feat/your-change
   ```
2. Set up and build from source — see [docs/CODING.md](docs/CODING.md).
3. Reload and drive the extension while developing — see [docs/RUNNING.md](docs/RUNNING.md).
4. Run the tests and learn the gates — see [docs/TESTING.md](docs/TESTING.md).
5. Commit, branch, and open a PR — see [docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md).

Prerequisites: GNOME Shell 45-50, the `gnome-extensions` CLI, `node` (for the
`node --check` gate), and — for the live test suites only, not for `wctl` itself
— `jq`, `gdbus`, and `kitty` (the modification suite spawns a kitty window).

The Rust toolchain for the `wctl` CLI comes from [mise](https://mise.jdx.dev);
`.mise.toml` pins the exact version. Run `mise install` in the repository root
to get it, then `mise run ci` to run the gates.

## Before you open a PR

Work through the pre-handoff gates in
[docs/CHANGE-WORKFLOW.md](docs/CHANGE-WORKFLOW.md); they name the checks each kind
of change needs and where the commit and PR conventions live.

## Where things live

- Using the product (install, usage, D-Bus method table): [README.md](README.md)
- Architecture and finding your way around: [docs/OVERVIEW.md](docs/OVERVIEW.md)
- Cutting a release: [docs/RELEASING.md](docs/RELEASING.md)

## Reporting issues

Include your GNOME Shell version (`gnome-shell --version`), distribution, steps to
reproduce, expected vs actual behavior, and relevant log output (see
[docs/MONITORING.md](docs/MONITORING.md)).

## Feature requests

Describe the use case, your proposed solution (if any), and alternatives
considered. Open an issue before a large change so we can agree on the approach.

By contributing, you agree that your contributions are licensed under the MIT
License.
