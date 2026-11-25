# Change workflow

## Commits

Call the Skill tool with `commit-commands:commit` for the standard flow.

**Local delta:**

- One logical change per commit. In a PR with several fixes, each fix commit
  carries its own test; a test harness the fixes share lands in an earlier
  commit.
- A change to what a spec in `docs/specs/` requires lands in the same commit as
  the code and the tests that pin it. A spec edit that changes no requirement
  can land alone.
- Subject: `<type>: <short description>`, with `<type>` one of `feat`, `fix`,
  `docs`, `test`, `build`, `refactor`, `chore`. Append `!` for a breaking
  change: `feat!: ...`.
- No emojis in commit messages, PR titles or PR bodies.

## Branches

- Branch from `main`. Commit nothing directly to `main`, a release version bump
  included.
- Prefix: `feat/`, `fix/`, `docs/`, `test/`, `build/`, `refactor/`, `chore/`.

## Before opening a PR

- Run the checks of the
  [minimum-checks table](TESTING.md#minimum-checks-before-a-pr). The PR's test
  plan names each check run and each check skipped.
- A change under `window-control@carlo9890.github.io/` passes the
  [extensions.gnome.org review](REVIEWING.md#extensionsgnomeorg-review).
- A user-facing change updates its page in `docs/user-guide/`, and `README.md`
  where the change alters what it shows.

## Pull requests

1. Open the PR against `main` with `gh pr create`. Its body says what changed
   and has the test plan: each check run and each check skipped (see
   [Before opening a PR](#before-opening-a-pr)).
2. Review it against [REVIEWING.md](REVIEWING.md): call the Skill tool with
   `worktree-flow:worktree-review` and the PR number.
3. Stop once the PR is open and its checks are green. The maintainer merges.

## CI

`.github/workflows/build.yml` runs the jobs `extension` and `cli` as two PR
checks. Every gate in them runs locally from the
[minimum-checks table](TESTING.md#minimum-checks-before-a-pr).

A PR that touches no path in the `on.pull_request.paths` filter of `build.yml`,
a docs-only PR for example, reports no checks. No branch protection is set, so
it can still merge: a missing tick is not a passed check.
