---
id: gnomewindo-unqjxk
title: Release and install path for the wctl binary (x86_64)
status: open
type: chore
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-7w035h
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

`scripts/release.sh`: `check_wctl_version` (lines 159-190) greps
`^VERSION=` from the script; `validate_assets` (lines 223-241) requires
`$PROJECT_ROOT/wctl`; the release uploads the asset `wctl` next to the
extension zip and `install-wctl.sh`. `install-wctl.sh:16` downloads
`https://github.com/carlo9890/gnome-window-control/releases/latest/download/wctl`
in `--download` mode and copies `$SCRIPT_DIR/wctl` in `--local`/`auto` mode
into `~/.local/bin`. `docs/RELEASING.md` step 1b says to bump `VERSION` in
`wctl`. The bash script no longer exists after the cutover chore.

## Problem

`release.sh` fails at the version check and the asset check, and the
installer copies a file that is not there. A release cannot be cut.

## Recommended action

`release.sh`: read the CLI version from `cli/Cargo.toml` (`^version = "..."`)
and keep the `0.N.0` check against `metadata.json`; build the asset with
`mise exec -- cargo build --release --target x86_64-unknown-linux-musl`
(add the target with `mise exec -- rustup target add
x86_64-unknown-linux-musl`, document it in RELEASING.md), verify it with
`file` (`statically linked`), and upload
`cli/target/x86_64-unknown-linux-musl/release/wctl` under the asset name
`wctl` so the installer URL does not change. Set `[profile.release]` with
`strip = true`, `lto = true`, `codegen-units = 1` in `cli/Cargo.toml`.

`install-wctl.sh`: in `--download` mode fetch the asset and `chmod +x`; refuse
on `uname -m` other than `x86_64` with `only x86_64 binaries are published;
use --local to build from source`; in `--local` mode copy
`cli/target/release/wctl`, running `mise run build` first when it is missing.

`docs/RELEASING.md`: step 1b points at `cli/Cargo.toml`; the assets list says
the binary is static x86_64; the version-format section is unchanged.

Out of this chore: aarch64 assets, publishing to crates.io.

## Acceptance criteria

- [ ] `./scripts/release.sh --dry-run` (or the script's equivalent check mode; add one if none exists) passes the version and asset checks with the crate version equal to `0.N.0` for the `metadata.json` version N
- [ ] `file cli/target/x86_64-unknown-linux-musl/release/wctl` contains `statically linked`, and `ldd` on it prints `not a dynamic executable`
- [ ] `./install-wctl.sh --local` installs a working `~/.local/bin/wctl` (`wctl --version` prints the crate version)
- [ ] On the next real release, `curl -L https://github.com/carlo9890/gnome-window-control/releases/latest/download/wctl -o /tmp/wctl && chmod +x /tmp/wctl && /tmp/wctl --version` prints the released version; record the output as a comment
