# GNOME Window Control

A GNOME Shell extension that provides a D-Bus interface for listing and controlling windows on Wayland. This fills a critical gap: on Wayland, there's no standard way to enumerate windows from the command line (unlike X11's `wmctrl`).

## Features

- **List windows** - Enumerate all windows with their metadata (ID, title, WM class, workspace, monitor, etc.)
- **Window info** - Get detailed information about any window by ID
- **Activate windows** - Focus/raise windows by ID, title, WM class, or PID
- **Move/resize windows** - Position and size windows programmatically
- **Window state control** - Minimize, maximize, fullscreen, always-on-top, sticky
- **CLI-friendly** - Easy to use from bash scripts via `gdbus` or the included `wctl` wrapper

## Compatibility

- GNOME Shell 45-50
- Wayland and X11 sessions

## Installation

### Extension

#### From GitHub Releases (Recommended)

1. Download the latest release from the [GitHub Releases page](https://github.com/carlo9890/gnome-window-control/releases)

2. Install the downloaded zip file:
   ```bash
   gnome-extensions install window-control@hko9890_v*.zip --force
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable window-control@hko9890
   ```

#### From Source (For Development)

Building and installing from source is a contributor task — see
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/CODING.md](docs/CODING.md).

### wctl CLI Wrapper (Optional)

Use the install script:
```bash
./install-wctl.sh
```

Or manually copy to your PATH:
```bash
cp wctl ~/.local/bin/
# or
sudo cp wctl /usr/local/bin/
```

## Usage

### Using wctl (Recommended)

```bash
# List all windows
wctl list

# List windows as JSON
wctl list --json

# Get focused window
wctl focused

# Get focused window as JSON
wctl focused --json

# Activate window by ID
wctl activate 12345

# Activate by title (exact match)
wctl activate -t "Firefox"

# Activate by title substring
wctl activate -s "GitHub"

# Activate by WM class
wctl activate -c kitty

# Activate by PID
wctl activate -p 54321

# Get detailed info about a window
wctl info 12345

# Get window info as JSON
wctl info 12345 --json

# Move window to position
wctl move 12345 100 200

# Resize window
wctl resize 12345 1920 1080

# Move and resize in one call
wctl move-resize 12345 0 0 960 1080

# Place a window using workarea-relative tokens
wctl place 12345 center top 50% 100%

# Exact pixel placement still works
wctl place 12345 1280 32 3840 1408

# Tile to a grid cell (e.g. left half, top-right quadrant)
wctl tile 12345 left
wctl tile 12345 top-right

# Center on screen (both axes, or just one)
wctl center 12345
wctl center 12345 horizontal

# Focus a window without raising it
wctl focus 12345

# Window state
wctl minimize 12345
wctl maximize 12345
wctl fullscreen 12345
wctl above 12345 on      # always-on-top
wctl sticky 12345 on     # show on all workspaces

# Close window (polite - allows save dialogs)
wctl close 12345

# Help
wctl --help
```

`wctl place` is a higher-level CLI convenience built on top of the existing
geometry methods. X and Y accept either absolute pixel coordinates or
alignment keywords (`left|center|right` and `top|center|bottom`). Width and
height accept either absolute pixels or percentages such as `50%` and `100%`.
Percentages are resolved against the monitor workarea, not the raw monitor
size, so panels and docks are respected.

### Using gdbus Directly

```bash
# List all windows
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.List

# Get detailed JSON
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed

# Activate by WM class
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ActivateByWmClass \
  "kitty"
```

## D-Bus Interface

The extension exports its object on GNOME Shell's own bus connection, so the D-Bus
destination is `org.gnome.Shell` (not a standalone service name).

**Bus name (dest):** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/WindowControl`  
**Interface:** `org.gnome.Shell.Extensions.WindowControl`

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `List` | `() -> a(tssssbiiii)` | List all windows |
| `ListDetailed` | `() -> s` | List windows as JSON with full details |
| `ListMonitors` | `() -> s` | List monitors as JSON |
| `Activate` | `(t) -> b` | Activate window by ID |
| `ActivateByTitle` | `(s) -> b` | Activate by exact title match |
| `ActivateByTitleSubstring` | `(s) -> b` | Activate by title substring |
| `ActivateByWmClass` | `(s) -> b` | Activate by WM_CLASS |
| `ActivateByPid` | `(i) -> b` | Activate by process ID |
| `Focus` | `(t) -> b` | Focus window (without raising) |
| `Close` | `(t) -> b` | Close window (polite) |
| `GetFocused` | `() -> (tss)` | Get focused window (id, title, class) |
| `Move` | `(tii) -> b` | Move window to (x, y) |
| `Resize` | `(tii) -> b` | Resize window to (width, height) |
| `MoveResize` | `(tiiii) -> b` | Move and resize window |
| `GetGeometry` | `(t) -> (iiii)` | Get window geometry |
| `GetWorkarea` | `(i) -> (iiii)` | Get a monitor's usable work area |
| `Minimize` | `(t) -> b` | Minimize window |
| `Unminimize` | `(t) -> b` | Restore minimized window |
| `Maximize` | `(t) -> b` | Maximize window |
| `Unmaximize` | `(t) -> b` | Restore maximized window |
| `Fullscreen` | `(t) -> b` | Make window fullscreen |
| `Unfullscreen` | `(t) -> b` | Exit fullscreen |
| `SetAbove` | `(tb) -> b` | Set/unset always-on-top |
| `SetSticky` | `(tb) -> b` | Set/unset sticky (all workspaces) |

## Background

On X11, tools like `wmctrl` and `xdotool` provide window control, but they don't
work on Wayland due to its security model. This extension bridges that gap by
exposing window control through GNOME Shell's privileged position.

## Contributing & internals

- Repository layout and architecture: [docs/OVERVIEW.md](docs/OVERVIEW.md)
- Building from source, testing, contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Version numbering (`wctl --version` `0.N.0` ↔ release `vN`): [docs/RELEASING.md](docs/RELEASING.md#version-format)

## License

MIT License - see [LICENSE](LICENSE) file.
