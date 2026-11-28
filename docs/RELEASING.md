# Releasing

Create every release with `scripts/release.sh`, never with `gh release create`
or the web UI. `./scripts/release.sh --help` lists the assets it attaches and
the checks it makes.

## What ships

- The extension zip holds exactly the git-tracked files of
  `window-control@carlo9890.github.io/`. A new file ships once it is committed,
  and the extensions.gnome.org reviewer reads it.
- `wctl` is a separate asset, a static x86_64 binary
  ([0004](decisions/0004-the-wctl-release-asset-is-one-static-binary-with-no-runtime-dependencies.md)),
  and never goes into the zip.
- Keep the `uuid` in `metadata.json` as it is. A new UUID is a new
  extensions.gnome.org listing and loses every existing user.

## Version format

- A release and its tag are `vN`, e.g. `v26`.
- `metadata.json` holds `version-name` as the string `"N"`. It is what users
  see and what `GetVersion` returns. It holds no `version` key:
  extensions.gnome.org sets its own on upload.
- `cli/Cargo.toml` holds `version = "0.N.0"`, so `wctl --version` prints
  `0.26.0` for `v26`. `scripts/check-version.sh` enforces the pair in CI and in
  `release.sh`.

## Cut a release

1. On a branch, set the [version](#version-format) in `metadata.json` and
   `cli/Cargo.toml`, then refresh the lock, or CI and the release build refuse
   it: `(cd cli && cargo update -p wctl)`.
2. Commit `chore: bump version to vN`, open the PR, and stop there: the merge
   is the user's ([CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md#pull-requests)). Go
   on with step 3 once the PR is merged.
3. On the merged `main` commit, run the
   [extensions.gnome.org review](REVIEWING.md#extensionsgnomeorg-review). Fix
   each violation through a PR, then start this step again on the new `main`.
4. On the same commit, run every check the "Before release" row of
   [TESTING.md](TESTING.md#minimum-checks-before-a-pr) requires, in a headless
   shell or a VM guest, never in the real session
   (ask before each start as [RUNNING.md](RUNNING.md#hard-rules) says; a
   throwaway VM is the exception). Do not tag until all pass.
5. Tag that commit and push the tag: `git tag vN && git push origin vN`.
6. Write the [release notes](#release-notes) to a file outside the repository,
   e.g. `/tmp/vN-notes.md`.
7. Run `./scripts/release.sh --notes-file /tmp/vN-notes.md`. Run it again
   after a failed upload: it replaces the release's assets and notes in place.
   The re-run asks `(y/N)` on stdin and aborts without an answer, so ask the
   user, then pipe the answer: `echo y | ./scripts/release.sh --notes-file …`.

## Release notes

Read the release range before you write: `git log --oneline v<N-1>..vN`, and
`git show <sha>` where the user impact is not clear. Write what a user gets,
not a commit list.

- Put in: what a user can do now, as the command they type
  (`wctl wait -c firefox`); what a user must act on (a breaking change, a
  changed output or exit code, a new requirement); a bug a user could have hit,
  by its symptom.
- Leave out: refactors, tests, CI, docs, dependency and toolchain bumps,
  benchmarks, root causes, anything invisible from outside `wctl` and the
  extension.
- Form: bullets under `## What's new`, and `## Fixed` when it has items. One
  line per item, under 15 lines in total. No install instructions: the script
  appends them.

## Publish to extensions.gnome.org

The listing is <https://extensions.gnome.org/extension/10886/window-control/>.
Upload to it only; never create a second listing.

Upload now and then, after the maintainer has tested the release on their own
machine.

1. Download the zip asset of the GitHub release
   (`window-control@carlo9890.github.io_v<N>.zip`). Use no zip from `dist/` or
   CI: a later build writes a zip of the same name from newer code. The asset
   comes from the tag the review in step 3 passed.
2. Upload it at <https://extensions.gnome.org/upload/>. Every version needs a
   new upload and a new human review, usually weeks.

When a default shortcut, a tile position or `shell-version` changes, render the
listing screenshot and icon again and upload them by hand; the docstring of
`docs/images/generate.py` has the commands. The GitHub social preview uses the
same renders.

If the reviewer asks about the unauthenticated D-Bus interface, answer from
`docs/user-guide/security.md`: state the exposure, and offer neither a caller
allowlist nor a shared secret
([0002](decisions/0002-the-d-bus-interface-has-no-access-control.md)).
