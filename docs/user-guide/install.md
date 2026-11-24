# Install

## Compatibility

- GNOME Shell 45-50
- Wayland sessions, and X11 sessions on GNOME Shell 45-48

## Extension

### From extensions.gnome.org

Install it from the
[Window Control page on extensions.gnome.org](https://extensions.gnome.org/extension/10886/window-control/),
with the browser integration or the Extension Manager app.

> [!WARNING]
> On 2026-11-24, extensions.gnome.org still served version 9 for every GNOME
> Shell version. Version 9 has no rules and no keyboard shortcuts, and `wctl`
> needs version 16 or later. Until that page serves the current release,
> install [from GitHub Releases](#from-github-releases).

Every upload there waits for a manual review, so that page can be several
versions behind the GitHub release, and an older version has no rules and no
keyboard shortcuts. Run `wctl version --json` and read `capabilities`: `rules`
and `keybindings` are listed when the loaded extension has them. The same
command reports `"compatible": false` for a version before v25 installed from
that page - see [Checking the extension version](wctl.md#checking-the-extension-version).
For the newest version, install from GitHub Releases.

### From GitHub Releases

1. Download the latest release from the [GitHub Releases page](https://github.com/carlo9890/gnome-window-control/releases)

2. Install the downloaded zip file:
   ```bash
   gnome-extensions install window-control@carlo9890.github.io_v*.zip --force
   ```

3. Restart GNOME Shell:
   - On X11 (GNOME 45-48): Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable window-control@carlo9890.github.io
   ```

### Upgrading from window-control@hko9890

The extension UUID changed to `window-control@carlo9890.github.io`. GNOME treats
the new UUID as a separate extension, so the old one keeps running until you
remove it. Both register the same D-Bus object, so do not leave both enabled.

```bash
gnome-extensions disable window-control@hko9890
gnome-extensions uninstall window-control@hko9890
gnome-extensions install window-control@carlo9890.github.io_v*.zip --force
# restart GNOME Shell (Alt+F2 r on X11 with GNOME 45-48, log out and back in on Wayland)
gnome-extensions enable window-control@carlo9890.github.io
```

### From Source (For Development)

Building and installing from source is a contributor task — see
[CONTRIBUTING.md](../../CONTRIBUTING.md) and [docs/CODING.md](../CODING.md).

## wctl CLI (Optional)

`wctl` is a statically linked binary. It needs nothing at runtime — no shell,
no `jq`, no `gdbus`.

Use the install script, which puts `wctl` in `~/.local/bin`:
```bash
curl -fsSL https://github.com/carlo9890/gnome-window-control/releases/latest/download/install-wctl.sh | bash
```

Piped from `curl`, the script downloads the published binary. Run from a
checkout, it installs a local build when one exists and downloads otherwise;
`--download` always downloads; `--local` installs the local build, and builds
it first when there is none. `--help` shows the
options.

The script checks the download against the release's `wctl.sha256` and runs it
once before it replaces an installed `wctl`, so a failed download keeps the old
one. Set `WCTL_VERSION` to a release tag (`vN`) to install the `wctl` of that
release. The installer attached to a release defaults to that release.
Releases up to v16 have no `wctl.sha256`, so the script cannot install them.

Or download `wctl` and `wctl.sha256` from the [releases page](https://github.com/carlo9890/gnome-window-control/releases)
and put it on your PATH:
```bash
sha256sum -c wctl.sha256
chmod +x wctl
mv wctl ~/.local/bin/
# or
sudo mv wctl /usr/local/bin/
```

The published binary is x86_64 only; on another architecture build it from a
checkout — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

`wctl --version` prints `0.N.0` for the `wctl` of release `vN`; see
[Version format](../RELEASING.md#version-format).
