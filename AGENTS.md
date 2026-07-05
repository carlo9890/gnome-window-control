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
│   ├── start-nested.sh        # Start nested GNOME Shell session
│   └── debug-dbus.sh          # Debug D-Bus interface
├── dist/                      # Build output (gitignored)
├── wctl                       # CLI wrapper script
├── README.md                  # Project documentation
├── CONTRIBUTING.md            # Contribution guidelines
└── LICENSE                    # MIT License
```

## Development Workflow

### Testing Code Changes (Nested Session)

Since disable/enable doesn't reload JS code, use a **nested GNOME Shell session**:

```bash
# 1. Make your code changes
# 2. Install the updated files
./scripts/build.sh install

# 3. Start a nested GNOME Shell (runs in a window)
./scripts/start-nested.sh

# 4. Inside the nested session, open a terminal and enable:
gnome-extensions enable window-control@hko9890

# 5. Test your changes in the nested session
# 6. Close the window and repeat
```

The nested session runs GNOME Shell in a window, isolated from your main session. All logs appear in the terminal that started it.

### Testing D-Bus Interface

Use the debug script to test D-Bus methods:

```bash
./scripts/debug-dbus.sh
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

**Tip**: Use a **nested GNOME Shell session** instead of logging out/in. Run `./scripts/start-nested.sh` to start GNOME Shell in a window for testing.

### Logging

GNOME Shell extensions use the `console` API but with different log levels:

| Function | Level | Visible by default? |
|----------|-------|---------------------|
| `console.log()` | DEBUG | No - filtered out |
| `console.warn()` | WARNING | Yes |
| `console.error()` | CRITICAL | Yes |

To see `console.log()` output, set `G_MESSAGES_DEBUG=all` before starting GNOME Shell.

For production code, use `console.error()` sparingly for actual errors only.

### JavaScript Syntax Validation

**CRITICAL**: When modifying JavaScript files (extension.js, etc.), you MUST validate syntax before closing any task.

Run this command:
```bash
node --check window-control@hko9890/extension.js
```

If this fails, the code has syntax errors and cannot be committed.

**Task Acceptance Criteria**: All tasks that modify JavaScript code MUST include:
```markdown
- [ ] Code passes syntax check (`node --check <file>`)
```

### Common Issues

1. **Extension not found**: Run `gnome-extensions list` - if not listed, need restart
2. **D-Bus errors**: Check `journalctl --user -b -g "Window Control" -f` for JavaScript errors
3. **Methods returning wrong types**: GJS D-Bus has quirks with uint64 - use BigInt or GLib.Variant
4. **Code changes not taking effect**: Need full GNOME Shell restart, not just disable/enable

## Release Process

**CRITICAL**: All releases MUST be created using the release script.

```bash
./scripts/release.sh
```

**Never create releases manually** with `gh release create` or the GitHub web UI. The script ensures:
- All 3 required assets are included (extension zip, wctl, install-wctl.sh)
- Version numbers match between metadata.json and wctl
- Git tags exist and are pushed
- Release notes are properly formatted

See CONTRIBUTING.md for full release checklist.

## Requirements Doc

See `gnome-window-control-extension-requirements.md` for full API specification.
