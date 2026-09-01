# Releasing

**All releases MUST be created with the release script** — never by hand via
`gh release create` or the web UI.

```bash
./scripts/release.sh
```

The script guarantees all three assets are attached (extension zip, `wctl`,
`install-wctl.sh`), that the `metadata.json` and `wctl` versions match, that git
tags exist and are pushed, and that the release notes come from `CHANGELOG.md`.

## Release checklist

1. Update the version in `window-control@carlo9890.github.io/metadata.json`.
2. Bump `VERSION` in `wctl` to the matching `0.<N>.0` form (see Version format
   below). `scripts/release.sh` hard-fails if it does not match `metadata.json`.
3. Move the `CHANGELOG.md` `Unreleased` section under a new `vN` heading.
4. Commit: `git commit -am "chore: bump version to vN"`.
5. Tag: `git tag vN`.
6. Push: `git push && git push --tags`.
7. Run: `./scripts/release.sh`.

## Version format

Releases, git tags, and CHANGELOG entries use the integer form `vN` (e.g. `v7`).
`wctl --version` reports the zero-padded `0.N.0` form (e.g. `0.7.0`) for the same
release; `scripts/release.sh` enforces the `0.<N>.0 ↔ vN` mapping. So
`wctl --version` reporting `0.7.0` corresponds to GitHub release/tag `v7`.

## Publishing to extensions.gnome.org (EGO)

EGO is a separate channel from the GitHub release. Do the GitHub release first,
then upload the same zip.

1. Build the zip: `./scripts/build.sh all`. The archive must have
   `metadata.json` at its root, not inside a subdirectory — `build.sh` zips the
   contents of the extension directory, so this holds as long as you use it.
2. Upload `dist/window-control@carlo9890.github.io_v<version>.zip` at
   <https://extensions.gnome.org/upload/>.
3. Wait for the review. A human reviewer reads every line of the extension, and
   the queue is usually weeks. Every new version needs a new upload and a new
   review.

Constraints the review enforces, which the code must keep satisfying:

- The `uuid` is permanent. Never change it again — a new UUID is a new listing
  and loses every existing user.
- No `eval()`, no `Function()`, no `GLib.spawn` or any other subprocess, and no
  bundled binaries. `wctl` is a separate asset and MUST stay out of the zip.
- `disable()` must undo everything `enable()` did: unexport the D-Bus object,
  disconnect every signal, and remove every timeout. The extension currently has
  no signals and no timers, so keep it that way, or extend `disable()`.
- No minified or generated code. The source in the zip is what the reviewer reads.
- The license must be GPL-compatible. This project is MIT, which qualifies.
- `shell-version` must list only versions the extension really supports.

EGO assigns its own integer `version` on upload and ignores the one in
`metadata.json`. `version-name` is what users see, so keep it in step with the
`vN` release number.
