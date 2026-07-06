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
   cp -r window-control@hko9890 ~/.local/share/gnome-shell/extensions/
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable window-control@hko9890
   ```

### Verify Installation

Check that the extension is installed:
```bash
gnome-extensions list | grep window-control
```

Check extension status:
```bash
gnome-extensions info window-control@hko9890
```

## Usage

Once enabled, the extension provides a D-Bus interface for window control operations.

## Development

### Enable Debug Logging

View extension logs:
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

### Reload Extension

`gnome-extensions disable`/`enable` does NOT reload the JavaScript from disk. To
apply changes to `extension.js`, restart GNOME Shell (log out/in on Wayland;
`Alt+F2` `r` on X11), or use a nested GNOME Shell session for testing.

## License

See repository LICENSE file.
