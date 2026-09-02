# Window Control GNOME Extension

D-Bus interface for listing and controlling windows on GNOME Shell (Wayland).

## Compatibility

- GNOME Shell 45-50

## Installation

### From Source

1. Clone or download this repository:
   ```bash
   git clone <repository-url>
   cd gnome-window-control
   ```

2. Install the extension by copying it into the extensions directory:
   ```bash
   cp -r window-control@carlo9890.github.io ~/.local/share/gnome-shell/extensions/
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable window-control@carlo9890.github.io
   ```

### Verify Installation

Check that the extension is installed:
```bash
gnome-extensions list | grep window-control
```

Check extension status:
```bash
gnome-extensions info window-control@carlo9890.github.io
```

## Usage

Once enabled, the extension exports a D-Bus interface on GNOME Shell's own bus
connection:

- **Bus name (dest):** `org.gnome.Shell`
- **Object path:** `/org/gnome/Shell/Extensions/WindowControl`
- **Interface:** `org.gnome.Shell.Extensions.WindowControl`

Call a method with `gdbus`, e.g. list all windows as JSON:

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed
```

The full method table and the `wctl` CLI (a friendlier front end for all
of these methods) are documented in the project's top-level
[README](https://github.com/carlo9890/gnome-window-control#readme), which is not
shipped inside this extension zip.

## Development

### Enable Debug Logging

View this extension's log lines (filtered by its `Window Control` tag):
```bash
journalctl --user -b -g "Window Control" -f
```

`console.log()` output is DEBUG level and hidden unless GNOME Shell is started
with `G_MESSAGES_DEBUG=all`.

### Reload Extension

`gnome-extensions disable`/`enable` does NOT reload the JavaScript from disk. See
[docs/RUNNING.md](https://github.com/carlo9890/gnome-window-control/blob/main/docs/RUNNING.md)
for the reload workflow (restart GNOME Shell, or use a nested session).

## License

See repository LICENSE file.
