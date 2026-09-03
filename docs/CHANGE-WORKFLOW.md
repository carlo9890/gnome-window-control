# Change Workflow

## Pre-handoff gates

Before committing or opening a PR:

- Modified JavaScript passes `node --check` (see [CODING.md](CODING.md)) — a CI gate.
- `mise run ci` passes (headless; the CI gate).
- The suites required for this kind of change pass — see the minimum-checks table
  in [TESTING.md](TESTING.md).
- Code changes to `extension.js` are actually reloaded and exercised in a running
  shell (see [RUNNING.md](RUNNING.md)) — `node --check` is syntax only.

## Commits

- One logical change per commit.
- Message format: `<type>: <short description>`, where `<type>` is `feat`, `fix`,
  `docs`, `refactor`, or `chore`. Optional longer body explaining what and why.
- No emojis in commit messages.

Example:

```
fix: reject width/height of 0 in wctl resize

The regex accepted 0 despite the "must be a positive number" message.
```

## Branches

- Branch from `main`; never commit directly to `main`.
- Prefix: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`.

## Pull requests

1. Open the PR against `main`.
2. Describe what changed and why, and the test plan (which suites you ran).
3. Update `README.md` for user-facing changes and the relevant `docs/` topic for
   procedures.
4. Keep commits focused.

## CI — required checks

`.github/workflows/build.yml` runs three gates:

- `node --check` on every extension `*.js`
- `mise run ci`
- `./scripts/build.sh all` (validate + package)

All must be green. It triggers on pushes to `main` and PRs against `main`, and
only when a path under `window-control@carlo9890.github.io/`, `cli/`, `scripts/`,
`tests/`, `install-wctl.sh`, `.mise.toml` or the workflow itself changed — a
docs-only change reports no checks at all rather than a pass.

Releases are a separate flow — see [RELEASING.md](RELEASING.md).
