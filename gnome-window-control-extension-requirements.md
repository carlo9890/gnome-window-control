# GNOME Window Control Extension - Requirements

## Overview

A GNOME Shell extension that provides a D-Bus interface for listing and controlling windows on Wayland. This fills a critical gap: on Wayland, there's no standard way to enumerate windows from the command line (unlike X11's `wmctrl`).

## Problem Statement

On Wayland/GNOME:
- Traditional tools (`wmctrl`, `xdotool`, `xprop`) don't work
- The existing "Activate Window by Title" extension can activate windows but cannot list them
- GNOME Shell's `Eval` method is disabled by default for security
- Scripts (like `occ`) need a reliable way to discover and focus windows

## Goals

1. **List windows** - Enumerate all windows with their metadata
2. **Activate windows** - Focus/raise windows by various criteria
3. **Move/resize windows** - Position and size windows programmatically
4. **CLI-friendly** - Easy to use from bash scripts via `gdbus`
5. **Robust** - Handle edge cases (no windows, window closed during call, etc.)

## Non-Goals

- Window decoration/theming
- Keyboard shortcuts - this is a programmatic interface only
- Tiling/snapping logic - just expose primitives, let scripts handle layout

---

## GNOME Shell APIs Available

From `Meta.Window` (via `global.get_window_actors()` → `actor.get_meta_window()`):

### Window Identification
| Method | Returns | Description |
|--------|---------|-------------|
| `get_id()` | `uint64` | Unique window ID (stable for window lifetime) |
| `get_stable_sequence()` | `uint` | Monotonically increasing ID assigned at creation |
| `get_pid()` | `int` | Process ID that created the window |
| `get_title()` | `string` | Window title (can change dynamically) |
| `get_wm_class()` | `string` | WM_CLASS name (e.g., "Firefox", "kitty") |
| `get_wm_class_instance()` | `string` | WM_CLASS instance (e.g., "Navigator", "kitty") |
| `get_sandboxed_app_id()` | `string` | Flatpak/Snap app ID if sandboxed |
| `get_gtk_application_id()` | `string` | GTK application ID if set |

### Window State
| Method | Returns | Description |
|--------|---------|-------------|
| `has_focus()` | `bool` | Window currently has keyboard focus |
| `appears_focused()` | `bool` | Window appears focused (may differ from has_focus) |
| `is_hidden()` | `bool` | Window is hidden |
| `is_minimized()` | `bool` | Window is minimized |
| `is_maximized()` | `bool` | Window is maximized (H and V) |
| `is_fullscreen()` | `bool` | Window is fullscreen |
| `is_above()` | `bool` | Window is "always on top" |
| `is_on_all_workspaces()` | `bool` | Window is sticky (visible on all workspaces) |
| `is_skip_taskbar()` | `bool` | Should be hidden from taskbars |

### Window Position & Size
| Method | Returns | Description |
|--------|---------|-------------|
| `get_frame_rect()` | `Meta.Rectangle` | Window bounds (x, y, width, height) |
| `get_buffer_rect()` | `Meta.Rectangle` | Actual pixel buffer bounds |
| `get_monitor()` | `int` | Monitor index window is on |

### Workspace
| Method | Returns | Description |
|--------|---------|-------------|
| `get_workspace()` | `Meta.Workspace` | Workspace the window is on |
| `located_on_workspace(ws)` | `bool` | Check if on specific workspace |

### Window Type
| Method | Returns | Description |
|--------|---------|-------------|
| `get_window_type()` | `Meta.WindowType` | Type: NORMAL, DIALOG, MENU, TOOLTIP, etc. |

### Actions - Focus & State
| Method | Description |
|--------|-------------|
| `activate(timestamp)` | Activate/focus the window |
| `focus(timestamp)` | Focus the window |
| `raise()` | Raise window to top of stack |
| `minimize()` / `unminimize()` | Minimize/restore |
| `maximize(flags)` / `unmaximize(flags)` | Maximize/restore (flags: HORIZONTAL, VERTICAL, BOTH) |
| `make_fullscreen()` / `unmake_fullscreen()` | Fullscreen toggle |
| `make_above()` / `unmake_above()` | Set/unset always-on-top |
| `stick()` / `unstick()` | Make window appear on all workspaces |
| `delete()` | Request window close (polite) |
| `kill()` | Force kill the window |

### Actions - Position & Size
| Method | Description |
|--------|-------------|
| `move_frame(user_op, x, y)` | Move window to (x, y) using frame coordinates |
| `move_resize_frame(user_op, x, y, w, h)` | Move and resize window |
| `move_to_monitor(monitor_index)` | Move window to specific monitor |
| `change_workspace(workspace)` | Move window to workspace |
| `change_workspace_by_index(index)` | Move window to workspace by index |

**Note on `user_op`**: Boolean indicating if this is a user operation. Set to `true` for script-initiated moves (affects animation and constraints).

### Global APIs
| API | Description |
|-----|-------------|
| `global.get_window_actors()` | Get all window actors |
| `global.get_current_time()` | Get timestamp for activation |
| `global.get_workspace_manager()` | Access workspace manager |

---

## D-Bus Interface Design

### Service Name
```
org.gnome.Shell.Extensions.WindowControl
```

### Object Path
```
/org/gnome/Shell/Extensions/WindowControl
```

### Interface Name
```
org.gnome.Shell.Extensions.WindowControl
```

### Methods

#### `List() → a(tssssbiiii)`

List all windows. Returns array of tuples:
- `t` - Window ID (uint64)
- `s` - Title
- `s` - WM Class
- `s` - WM Class Instance  
- `s` - Sandboxed App ID (empty if not sandboxed)
- `b` - Has focus
- `i` - Workspace index (-1 if on all workspaces)
- `i` - Monitor index
- `i` - PID
- `i` - Window type (enum value)

Example output (JSON representation):
```json
[
  [12345, "oc:setup", "kitty", "kitty", "", false, 0, 0, 54321, 0],
  [12346, "Firefox", "Firefox", "Navigator", "org.mozilla.firefox", true, 0, 1, 54322, 0]
]
```

#### `ListDetailed() → s`

Returns JSON string with full window details for complex queries:
```json
[
  {
    "id": 12345,
    "title": "oc:setup",
    "wm_class": "kitty",
    "wm_class_instance": "kitty",
    "sandboxed_app_id": "",
    "gtk_application_id": "",
    "pid": 54321,
    "has_focus": false,
    "appears_focused": false,
    "is_hidden": false,
    "is_minimized": false,
    "is_maximized": false,
    "is_fullscreen": false,
    "is_above": false,
    "is_on_all_workspaces": false,
    "is_skip_taskbar": false,
    "workspace": 0,
    "monitor": 0,
    "window_type": "NORMAL",
    "frame_rect": {"x": 0, "y": 0, "width": 1920, "height": 1080}
  }
]
```

#### `Activate(id: t) → b`

Activate window by ID. Returns true if found and activated.

#### `ActivateByTitle(title: s) → b`

Activate first window with exact title match.

#### `ActivateByTitleSubstring(substring: s) → b`

Activate first window whose title contains substring.

#### `ActivateByWmClass(wm_class: s) → b`

Activate first window with matching WM_CLASS.

#### `ActivateByPid(pid: i) → b`

Activate first window owned by process.

#### `Focus(id: t) → b`

Focus window without raising (subtle difference from Activate).

#### `Close(id: t) → b`

Request window close (polite - allows save dialogs).

#### `GetFocused() → (tss)`

Returns the currently focused window: (id, title, wm_class).
Returns (0, "", "") if no window has focus.

---

### Move & Resize Methods

#### `Move(id: t, x: i, y: i) → b`

Move window to position (x, y). Returns true if successful.

#### `Resize(id: t, width: i, height: i) → b`

Resize window to (width, height). Returns true if successful.

#### `MoveResize(id: t, x: i, y: i, width: i, height: i) → b`

Move and resize window in one call. More efficient than separate calls.

#### `GetGeometry(id: t) → (iiii)`

Get window geometry: (x, y, width, height). Returns (-1, -1, -1, -1) if not found.

#### `MoveToMonitor(id: t, monitor: i) → b`

Move window to specified monitor index.

#### `MoveToWorkspace(id: t, workspace: i) → b`

Move window to specified workspace index.

---

### State Change Methods

#### `Minimize(id: t) → b`

Minimize window.

#### `Unminimize(id: t) → b`

Restore minimized window.

#### `Maximize(id: t) → b`

Maximize window (both directions).

#### `Unmaximize(id: t) → b`

Restore maximized window.

#### `Fullscreen(id: t) → b`

Make window fullscreen.

#### `Unfullscreen(id: t) → b`

Exit fullscreen.

#### `SetAbove(id: t, above: b) → b`

Set or unset always-on-top.

#### `SetSticky(id: t, sticky: b) → b`

Set or unset sticky (visible on all workspaces).

---

### Signals (Optional - for future)

#### `WindowOpened(id: t, title: s, wm_class: s)`
#### `WindowClosed(id: t)`  
#### `WindowFocused(id: t)`
#### `WindowTitleChanged(id: t, new_title: s)`

---

## CLI Usage Examples

### List all windows
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.List
```

### Get detailed JSON list
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed \
  | sed "s/^('//;s/',)$//" | jq .
```

### Activate by ID
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Activate \
  12345
```

### Find and activate kitty window
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ActivateByWmClass \
  "kitty"
```

### Get currently focused window
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.GetFocused
```

### Move window to position
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Move \
  12345 100 100
```

### Resize window
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Resize \
  12345 1920 1080
```

### Move and resize in one call
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.MoveResize \
  12345 0 0 960 1080
```

### Move window to monitor 1
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.MoveToMonitor \
  12345 1
```

### Maximize a window
```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.WindowControl \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Maximize \
  12345
```

---

## Helper Script (Optional)

A `wctl` CLI wrapper could make this more ergonomic:

```bash
# Listing
wctl list                    # List windows (formatted table)
wctl list --json             # JSON output
wctl focused                 # Show focused window info

# Activation
wctl activate 12345          # Activate by ID
wctl activate -t "Firefox"   # Activate by title
wctl activate -c kitty       # Activate by WM class

# Geometry
wctl move 12345 100 100              # Move to x=100, y=100
wctl resize 12345 1920 1080          # Resize to 1920x1080
wctl move-resize 12345 0 0 960 1080  # Move and resize
wctl geometry 12345                   # Get current geometry

# Monitor & Workspace
wctl to-monitor 12345 1      # Move to monitor 1
wctl to-workspace 12345 2    # Move to workspace 2

# State
wctl minimize 12345
wctl maximize 12345
wctl fullscreen 12345
wctl above 12345 on          # Set always-on-top
wctl sticky 12345 on         # Show on all workspaces
wctl close 12345             # Close window (polite)

# Batch operations (scripts)
wctl list --json | jq '.[] | select(.wm_class == "kitty") | .id' | \
  xargs -I{} wctl move {} 0 0
```

---

## Extension Structure

```
window-control@example.com/
├── metadata.json           # Extension metadata
├── extension.js            # Main extension code
├── README.md              
└── schemas/                # If settings needed (probably not)
    └── org.gnome.shell.extensions.window-control.gschema.xml
```

### metadata.json
```json
{
  "uuid": "window-control@example.com",
  "name": "Window Control",
  "description": "D-Bus interface for listing and controlling windows",
  "version": 1,
  "shell-version": ["45", "46", "47"],
  "url": "https://github.com/username/gnome-window-control"
}
```

---

## Compatibility

### Target GNOME Versions
- GNOME 45+ (current LTS and newer)
- Note: GNOME 48 changes `global.get_window_actors()` to `global.compositor.get_window_actors()` - handle both

### Testing Matrix
- [ ] GNOME 45 (Ubuntu 24.04 LTS)
- [ ] GNOME 46 (Fedora 40, current)
- [ ] GNOME 47 (Fedora 41)

---

## Security Considerations

1. **No dangerous operations** - We don't expose `kill()`, only `Close()` (polite close)
2. **No window content access** - We only expose metadata, not screenshots/content
3. **User-initiated** - Scripts calling this represent user intent (same as wmctrl on X11)
4. **Respects window constraints** - Move/resize respects window min/max size hints
5. **Session bus only** - Requires local session access, not system-wide

**Note**: This extension provides similar capabilities to `wmctrl` on X11. The security model is that any process with session bus access (i.e., any GUI app) can use these APIs. This is intentional for scriptability.

---

## Integration with occ

Once this extension exists, `occ` can:

1. **Replace** the "Activate Window by Title" extension dependency
2. **Add `occ list`** that shows all windows (not just kitty)
3. **Improve window detection** - use window ID instead of title matching
4. **Better error messages** - know if window exists but is minimized, etc.

Example integration:
```bash
# In occ, replace:
gdbus call ... ActivateWindowByTitle.activateByTitle "$WINDOW_TITLE"

# With:
gdbus call ... WindowControl.ActivateByTitle "$WINDOW_TITLE"

# Or even better, use IDs:
WINDOW_ID=$(gdbus call ... WindowControl.List | parse_for_title "$WINDOW_TITLE")
gdbus call ... WindowControl.Activate "$WINDOW_ID"
```

---

## Open Questions

1. **Should we include window icons?** - Could be useful but adds complexity
2. **Real-time signals?** - Useful for reactive UIs but overkill for CLI use
3. **Filter parameters in List()?** - e.g., `List(workspace: i)` - or keep it simple?
4. **Extension name?** - "Window Control", "Window List", "wmctrl for Wayland"?

---

## References

- [GNOME Shell Extension Guide](https://gjs.guide/extensions/)
- [Meta.Window API](https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html)
- [Activate Window by Title Extension](https://github.com/lucaswerkmeister/activate-window-by-title) - Reference implementation
- [GJS D-Bus Guide](https://gjs.guide/guides/gio/dbus.html)
