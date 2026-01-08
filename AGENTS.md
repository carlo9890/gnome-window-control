# Agent Instructions

## Project Overview

GNOME Window Control - A GNOME Shell extension providing D-Bus interface for window control on Wayland.

## Project Structure

```
stop-gap/
├── window-control@hko9890/    # GNOME Shell extension source
│   ├── extension.js           # Main extension code
│   ├── metadata.json          # Extension metadata
│   └── README.md              # Extension-specific docs
├── scripts/                   # Build and dev scripts
│   ├── build.sh               # Build distributable zip
│   └── update.sh              # Local dev update script
├── dist/                      # Build output (gitignored)
├── wctl                       # CLI wrapper script
├── README.md                  # Project documentation
├── CONTRIBUTING.md            # Contribution guidelines
└── LICENSE                    # MIT License
```

## Development Workflow

### Testing Extension Changes

After modifying `window-control@hko9890/extension.js`:

```bash
# Full update: validate, install, reload, test
./scripts/update.sh

# Or step by step:
./scripts/update.sh validate   # Check files are valid
./scripts/update.sh install    # Copy to ~/.local/share/gnome-shell/extensions/
./scripts/update.sh reload     # Disable and re-enable extension
./scripts/update.sh test       # Test D-Bus interface
./scripts/update.sh logs       # Check for errors
```

### Building for Distribution

```bash
./scripts/build.sh all         # Clean, validate, build zip
./scripts/build.sh install     # Install locally from source
```

Output goes to `dist/window-control@hko9890_v<version>.zip`

### Checking Extension Status

```bash
# Extension info
gnome-extensions info window-control@hko9890

# Check logs for errors
journalctl --user -b -g "Window Control" -f

# Test D-Bus
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetFocused
```

## D-Bus Interface

**Important**: The extension registers under `org.gnome.Shell`, not as a standalone service.

- **Destination**: `org.gnome.Shell`
- **Path**: `/org/gnome/Shell/Extensions/WindowControl`
- **Interface**: `org.gnome.Shell.Extensions.WindowControl`

### Testing Methods

```bash
# List windows
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed

# Get focused window
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetFocused

# Activate window by ID
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Activate \
  "uint64:12345"
```

## GNOME Extension Notes

### When Restart is Required

| Change Type | Restart Required? |
|-------------|-------------------|
| First install | Yes (log out/in on Wayland) |
| Code changes (extension.js) | **Yes** - disable/enable does NOT reload JS from disk |
| metadata.json changes | Yes |
| Adding new files | Yes |

**Important**: Unlike some plugin systems, `gnome-extensions disable/enable` does NOT reload JavaScript code from disk. It only calls `disable()` and `enable()` on the already-loaded code. To test actual code changes, you must restart GNOME Shell (log out/in on Wayland).

### Logging

GNOME Shell extensions use the `console` API but with different log levels:

| Function | Level | Visible by default? |
|----------|-------|---------------------|
| `console.log()` | DEBUG | No - filtered out |
| `console.warn()` | WARNING | Yes |
| `console.error()` | CRITICAL | Yes |

To see `console.log()` output, set `G_MESSAGES_DEBUG=all` before starting GNOME Shell.

For production code, use `console.error()` sparingly for actual errors only.

### Common Issues

1. **Extension not found**: Run `gnome-extensions list` - if not listed, need restart
2. **D-Bus errors**: Check `./scripts/update.sh logs` for JavaScript errors
3. **Methods returning wrong types**: GJS D-Bus has quirks with uint64 - use BigInt or GLib.Variant
4. **Code changes not taking effect**: Need full GNOME Shell restart, not just disable/enable

## Requirements Doc

See `gnome-window-control-extension-requirements.md` for full API specification.
