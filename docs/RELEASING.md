# Releasing

**All releases MUST be created with the release script** — never by hand via
`gh release create` or the web UI.

```bash
./scripts/release.sh
```

The script guarantees all three assets are attached (extension zip, `wctl`,
`install-wctl.sh`), that the `metadata.json` and `cli/Cargo.toml` versions match, that git
tags exist and are pushed, and that the release notes come from `CHANGELOG.md`.

## Release checklist

1. Update the version in `window-control@carlo9890.github.io/metadata.json`.
2. Bump `version` in `cli/Cargo.toml` to the matching `0.<N>.0` form (see Version format
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
- `wctl` is published as a **statically linked x86_64 binary**, built by
  `release.sh` with `cargo build --release --target x86_64-unknown-linux-musl`.
  The script refuses to publish a dynamically linked one. aarch64 is not
  published; on other architectures users build from source
  (`./install-wctl.sh --local`).
- `disable()` must undo everything `enable()` did: unexport the D-Bus object,
  disconnect every signal, and remove every timeout. `WaitForWindow` connects
  `window-created` plus per-window `notify::wm-class` / `notify::title` / `shown`
  / `unmanaged` handlers and arms a `GLib.timeout_add` per waiter, all of which
  `_cancelWaiters()` drops from `unexport()`. Any new signal or timer must be
  torn down on the same path.
- No minified or generated code. The source in the zip is what the reviewer reads.
- The license must be GPL-compatible. This project is MIT, which qualifies.
- `shell-version` must list only versions the extension really supports.

EGO assigns its own integer `version` on upload and ignores the one in
`metadata.json`. `version-name` is what users see, so keep it in step with the
`vN` release number.

### If the reviewer asks about the unauthenticated interface

Expect this question. It is the one substantive objection to the extension. A
draft answer:

> The interface is deliberately open to every application in the session, and the
> extension does not claim otherwise. There is no trust boundary to enforce: the
> session bus does not distinguish between processes of the same user, so a PID
> allowlist is both racy and useless here (the caller the shell sees is `wctl`,
> not the program that wanted the window moved), and a token file is readable by
> anything that can read the user's files. Rather than ship a mechanism that
> implies a guarantee it cannot provide, the extension makes the exposure
> explicit and lets the user decide:
>
> - The EGO description states, before install, exactly what is registered on
>   D-Bus and that the interface has no access control.
> - README.md has a "Security model" section that says the same at length.
> - Enabling the extension is the consent gate. It is off until the user turns
>   it on, and `disable()` unexports the object completely.
> - No window title or caller-supplied string is ever written to the log, at any
>   level, and per-call logging is `console.debug()`, gated behind
>   `G_MESSAGES_DEBUG`. Titles are the sensitive data here, and they do not
>   outlive the call.
> - `session-modes` is unset, so the extension does not run on the lock screen
>   and the interface cannot be queried while the session is locked.
>
> This restores on Wayland a capability that every X11 application already had
> with no gate at all. The difference is that here it is opt-in.

Do not answer by proposing a caller allowlist or a shared secret. Both are
theater, and offering one invites a longer review.
