# Releasing

**All releases MUST be created with the release script** — never by hand via
`gh release create` or the web UI.

```bash
./scripts/release.sh --notes-file <path>
```

Prerequisites the script enforces: `gh` authenticated, `mise` installed (pinned
Rust toolchain), clean working tree, on `main`.

The script guarantees all three assets are attached (extension zip, `wctl`,
`install-wctl.sh`), that the `metadata.json` and `cli/Cargo.toml` versions match,
that the local tag `vN` exists (it does not check the remote — `git push --tags`
is on you), and that the release has notes — it refuses to run without them.

## Release checklist

The version bump goes through a PR against `main` like any other change (see
[CHANGE-WORKFLOW.md](CHANGE-WORKFLOW.md)); the tag is cut on the merged `main`
commit.

1. Update both `version` and `version-name` in
   `window-control@carlo9890.github.io/metadata.json`.
2. Bump `version` in `cli/Cargo.toml` to the matching `0.<N>.0` form (see Version
   format below) — `wctl` compiles its minor version in as
   `EXPECTED_EXTENSION_VERSION`, so a mismatch makes every install report
   `compatible: false`, and `scripts/release.sh` hard-fails on it.
3. Refresh the lock: `(cd cli && cargo update -p wctl)` — otherwise the tag
   ships a lock pinning the old version and the release build dirties the tree.
4. Commit on a branch (`chore: bump version to vN`), open the PR, wait for the
   merge.
5. On the merged `main` commit: `git tag vN && git push --tags`.
6. Write the release notes (see below) to a file outside the repository.
7. Run: `./scripts/release.sh --notes-file <path>`.

## Release notes

There is no `CHANGELOG.md`. The notes are written by hand for each release and
passed to the script, which uses them as the release body.

Writing them is reading work, not scripting work. A generated list of commit
subjects says what was committed; the notes have to say what a user gets. Read
the release range first:

```bash
git log --oneline v8..v9        # the commits in the release
git show <sha>                  # whenever the user impact is not obvious
```

What belongs in the notes:

- What a user can do now that they could not before, written as the command
  they would type (`wctl wait -c firefox`).
- What a user must act on: breaking changes, a changed UUID, changed output or
  exit codes, a new requirement.
- Bugs a user could have hit, described by the symptom they saw, not the cause.

What stays out:

- Refactors, test suites, CI, doc changes, dependency and toolchain bumps.
- Benchmarks, profiling numbers, and root-cause explanations.
- Anything invisible from outside `wctl` and the extension.

Form:

- A handful of bullets under `## What's new`, and `## Fixed` when there is
  something to put there. Under 15 lines in total.
- One line per item. If an item needs a paragraph, it is written at the wrong
  altitude.
- No emojis, and no install instructions — the script appends those.

Keep the notes file out of the repository (`/tmp` is the right home). The
published release is the record; the detail behind it is in the commits.

## Version format

Releases and git tags use the integer form `vN` (e.g. `v7`).
`wctl --version` reports the zero-padded `0.N.0` form (e.g. `0.7.0`) for the same
release; `scripts/release.sh` enforces the `0.<N>.0 ↔ vN` mapping. So
`wctl --version` reporting `0.7.0` corresponds to GitHub release/tag `v7`.

## Publishing to extensions.gnome.org (EGO)

The listing is live at <https://extensions.gnome.org/extension/10886/window-control/>.
Uploads go to that same listing — never create a second one, and never change the
`uuid`.

EGO is a separate channel from the GitHub release. Do the GitHub release first,
then upload the same zip.

1. Build the zip: `./scripts/build.sh all`. The archive must have
   `metadata.json` at its root, not inside a subdirectory — `build.sh` zips the
   contents of the extension directory (`extension.js`, `dbus-interface.js`,
   `rules.js`, `rules-format.js`, `window-helpers.js`, `metadata.json`,
   `README.md`, `LICENSE`), so this holds as long as you use it.
2. Upload `dist/window-control@carlo9890.github.io_v<version>.zip` at
   <https://extensions.gnome.org/upload/>.
3. Wait for the review. A human reviewer reads every line of the extension, and
   the queue is usually weeks. Every new version needs a new upload and a new
   review.

### Pre-upload check with shexli

The upload page recommends `shexli`, the static analyzer the reviewer may also
run. Run it on the built zip before uploading:

```bash
pip install -U shexli 'tree-sitter==0.25.2'
shexli dist/window-control@carlo9890.github.io_v<version>.zip
```

**Pin `tree-sitter==0.25.2`.** shexli 0.2.1 pins neither dependency and resolves
tree-sitter 0.26.0 against a tree-sitter-javascript 0.25.0 grammar; the ABI
mismatch segfaults the process before any output (exit 139 on a zip,
`munmap_chunk(): invalid pointer` on a directory).

Four findings fire on the current sources. All four were investigated at v11 and
none is a defect — do not "fix" them. v11 was approved with all four present, so
shexli output is not a gate:

- `EGO-C49-003` / `EGO-C49-004` (errors): `Meta.MaximizeFlags` and
  `get_maximized()` are reported as removed-on-49 API. Both sit behind the
  `typeof win.get_maximized === 'function'` feature detection in
  `_maximizeFlags` / `_maximizeWindow` / `_unmaximizeWindow`
  (`extension.js`), so neither runs on GNOME 49. Answer the reviewer with the
  guard. Narrowing `shell-version` to 45-48 clears both and costs the 49/50
  users — `shell-version` cannot be widened again without a new review.
- `EGO-A-004` (warning): counts `console.error` toward a threshold of 5.
  Stripping every `console.log` still leaves 15, all in catch blocks, which
  [CODING.md](CODING.md) mandates.
- `EGO-L-005` (warning): wants `this._dbusImpl = null` lexically inside
  `disable()`. It lives in `WindowControlService.unexport()`, which `disable()`
  calls after setting `this._service = null`.

Constraints the review enforces, which the code must keep satisfying:

- The `uuid` is permanent. Never change it again — a new UUID is a new listing
  and loses every existing user.
- No `eval()`, no `Function()`, no `GLib.spawn` or any other subprocess, and no
  bundled binaries. `wctl` is a separate asset and MUST stay out of the zip.
- `wctl` is published as a **statically linked x86_64 binary**, built by
  `release.sh` with `cargo build --release --target x86_64-unknown-linux-musl`.
  The script refuses to publish a dynamically linked one. aarch64 is not
  published; on other architectures users build from source
  (`./install-wctl.sh --local`).
- `disable()` must undo everything `enable()` did. `unexport()` fails every
  pending call and drops the `window-created` handler, the per-window
  `notify::wm-class` / `notify::title` / `shown` / `unmanaged` handlers and the
  per-waiter timeouts that `WaitForWindow` and `WaitForGeometry` arm;
  `WindowRules.disable()` cancels its file monitor, its debounce timeout and its
  per-window handlers. Tear down any new signal or timer on the same path.
- No minified or generated code. The source in the zip is what the reviewer reads.
- The license must be GPL-compatible. This project is MIT, which qualifies.
- `shell-version` must list only versions the extension really supports.

EGO assigns its own integer `version` on upload and ignores the one in
`metadata.json`; `version-name` is what users see.

### If the reviewer asks about the unauthenticated interface

Expect this question; it is the one substantive objection to the extension.
Answer from README.md's "Security model" section — it is the authoritative
statement. The stance is the answer: state the exposure. Offering a caller
allowlist or a shared secret would be theater and invites a longer review.
