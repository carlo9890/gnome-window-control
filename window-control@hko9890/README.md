# Window Control GNOME Extension

D-Bus interface for listing and controlling windows on GNOME Shell (Wayland).

## Compatibility

- GNOME Shell 45, 46, 47

## Installation

### From Source

1. Clone or download this repository:
   ```bash
   git clone <repository-url>
   cd stop-gap
   ```

2. Install the extension:
   ```bash
   gnome-extensions install window-control@hko9890 --force
   ```

   Or manually copy to the extensions directory:
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

After making changes:
```bash
gnome-extensions disable window-control@hko9890
gnome-extensions enable window-control@hko9890
```

## License

See repository LICENSE file.
