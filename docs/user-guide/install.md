# Install

## Compatibility

- GNOME Shell 45-50.
- Wayland sessions only.

## Extension

### From GitHub Releases

1. Download `window-control@carlo9890.github.io_v<N>.zip` from the
   [releases page](https://github.com/carlo9890/gnome-window-control/releases).
2. Install it:
   ```bash
   gnome-extensions install window-control@carlo9890.github.io_v*.zip --force
   ```
3. Log out and log back in. GNOME Shell loads the new code only then.
4. Enable it:
   ```bash
   gnome-extensions enable window-control@carlo9890.github.io
   ```

### From extensions.gnome.org

Install it from its
[page on extensions.gnome.org](https://extensions.gnome.org/extension/10886/window-control/),
with the browser integration or the Extension Manager app.

extensions.gnome.org can lag behind; install from GitHub Releases when its
version lacks a feature you need. To see what the loaded extension supports,
see [Checking the extension version](wctl.md#checking-the-extension-version).

### Upgrading from window-control@hko9890

The old extension has another UUID, so GNOME keeps it next to the new one.
Both register the same D-Bus object: remove the old one first.

```bash
gnome-extensions disable window-control@hko9890
gnome-extensions uninstall window-control@hko9890
```

Then install the new one [from GitHub Releases](#from-github-releases).

## wctl

Install `wctl` into `~/.local/bin`:

```bash
curl -fsSL https://github.com/carlo9890/gnome-window-control/releases/latest/download/install-wctl.sh | bash
```

To pick a release or install a local build, run the script with `--help`.

Or download `wctl` and `wctl.sha256` from the
[releases page](https://github.com/carlo9890/gnome-window-control/releases)
and put `wctl` on your PATH:

```bash
sha256sum -c wctl.sha256
chmod +x wctl
mv wctl ~/.local/bin/
```

The published binary is x86_64 only. On another architecture, build it from
source: see [CONTRIBUTING.md](../../CONTRIBUTING.md).

`wctl --version` prints `0.N.0` for the `wctl` of release `vN`.
