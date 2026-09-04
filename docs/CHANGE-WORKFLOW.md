# Change Workflow

Use the `commit-commands:commit` and `commit-commands:commit-push-pr` skills for
the standard flow. This file is the local delta over them.

## Pre-handoff gates

Before committing or opening a PR:

- The suites required for this kind of change pass — the minimum-checks table in
  [TESTING.md](TESTING.md) is the bar.
- Code changes to `extension.js` are actually reloaded and exercised in a running
  shell (see [RUNNING.md](RUNNING.md)) — `node --check` is syntax only.

## Commits

- One logical change per commit.
- Message format: `<type>: <short description>`, where `<type>` is `feat`, `fix`,
  `docs`, `test`, `build`, `refactor`, or `chore`. Append `!` to the type for a
  breaking change (`feat!: ...`).
- No emojis in commit messages.

Example:

```
fix: reject width/height of 0 in wctl resize

The regex accepted 0 despite the "must be a positive number" message.
```

## Branches

- Branch from `main`; never commit directly to `main`. A release version bump
  goes through a PR like any other change — see [RELEASING.md](RELEASING.md).
- Prefix: `feat/`, `fix/`, `docs/`, `test/`, `build/`, `refactor/`, `chore/`.

## Pull requests

1. Open the PR against `main`.
2. Describe what changed and the test plan (which suites you ran).
3. Update `README.md` for user-facing changes and the relevant `docs/` topic for
   procedures.

The maintainer merges. An agent stops once the PR is open and its checks are
green.

## CI — required checks

`.github/workflows/build.yml` runs two jobs, which appear as two checks on the PR:

- `extension` — `node --check` on every extension `*.js`, then
  `./scripts/build.sh all` (validate + package)
- `cli` — `mise run ci`

Both must be green when they run. It triggers on pushes to `main` and PRs against
`main`, and only when a path under `window-control@carlo9890.github.io/`, `cli/`,
`scripts/`, `tests/`, `install-wctl.sh`, `.mise.toml` or the workflow itself
changed. No branch protection is configured, so a docs-only PR reports no checks
and is still mergeable.

Releases are a separate flow — see [RELEASING.md](RELEASING.md).
