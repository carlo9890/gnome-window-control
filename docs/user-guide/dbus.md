# D-Bus interface

The extension exports its object on GNOME Shell's own bus connection, so the D-Bus
destination is `org.gnome.Shell` (not a standalone service name).

**Bus name (dest):** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/WindowControl`  
**Interface:** `org.gnome.Shell.Extensions.WindowControl`

## Using gdbus directly

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

## Methods

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
| `Move` | `(tii) -> ()` | Move window to (x, y). Raises on failure — see **Errors** below |
| `Resize` | `(tii) -> ()` | Resize window to (width, height). Raises on failure |
| `MoveResize` | `(tiiii) -> ()` | Move and resize window. Raises on failure |
| `ApplyRules` | `(t) -> u` | Apply the loaded rules of rules.json and rules.d again: `0` for every open window, else that window. Returns how many windows a rule matched. Raises `NotFound` for an id no window has |
| `GetGeometry` | `(t) -> (iiii)` | Get window geometry |
| `GetWorkarea` | `(i) -> (iiii)` | Get a monitor's usable work area; `(-1, -1, -1, -1)` for an index that is not a monitor, and only then |
| `GetVersion` | `() -> s` | The extension version the running shell has **loaded** (not what is on disk) |
| `GetCapabilities` | `() -> as` | The feature names this extension supports, e.g. `['rules']` |
| `Minimize` | `(t) -> b` | Minimize window; `false` also for a window the shell does not let minimize |
| `Unminimize` | `(t) -> b` | Restore minimized window |
| `MinimizeNoAnimation` | `(t) -> b` | Minimize window without the shell's minimize animation; `false` as `Minimize` reports it |
| `UnminimizeNoAnimation` | `(t) -> b` | Restore minimized window without the animation |
| `ActivateNoAnimation` | `(t) -> b` | Activate window by ID, restoring a minimized one without the animation |
| `Maximize` | `(t) -> b` | Maximize window |
| `Unmaximize` | `(t) -> b` | Restore maximized window |
| `Fullscreen` | `(t) -> b` | Make window fullscreen |
| `Unfullscreen` | `(t) -> b` | Exit fullscreen |
| `SetAbove` | `(tb) -> b` | Set/unset always-on-top |
| `SetSticky` | `(tb) -> b` | Set/unset sticky (all workspaces); false if the state did not take |
| `ListWorkspaces` | `() -> s` | List workspaces as JSON (`index`, `name`, `is_active`, `window_count`) |
| `ActivateWorkspace` | `(i) -> b` | Switch to a workspace. Hides the Activities overview first (the switch is ignored while it is shown) and returns whether the switch took effect |
| `MoveToWorkspace` | `(ti) -> b` | Move window to a workspace |
| `MoveToMonitor` | `(ti) -> b` | Move window to a monitor |
| `WaitForWindow` | `(ssi) -> t` | Wait until a window matching `kind` (`class`, `title`, `substring`, `pid`) and `value` is shown (mapped and placed), up to `timeout_ms`; returns its ID, or 0 on timeout. The reply is deferred, the shell is never blocked, and the call is dropped if its caller leaves the bus. |
| `WaitForGeometry` | `(tii) -> (iiii)` | Wait until the window's frame has held still for `quiet_ms`, up to `timeout_ms`, then return it. The reply is deferred, the shell is never blocked, and the call is dropped if its caller leaves the bus. |

## Errors

`Move`, `Resize` and `MoveResize` return nothing and raise instead;
`ApplyRules`, `WaitForWindow` and `WaitForGeometry` raise too. The ERRORS block in
`window-control@carlo9890.github.io/dbus-interface.js` names the extension's own
errors and the standard `org.freedesktop.DBus.Error.*` names below that a
handler raises, and `org.gnome.gjs.JSError.*` is the name
GJS raises when any other method throws. Before GNOME 50, a wait method that
throws before it starts waiting sends no reply, and the caller's D-Bus timeout
ends the call.

| Error name | Meaning |
|------------|---------|
| `org.gnome.Shell.Extensions.WindowControl.NotFound` | No window has that ID (also `WaitForGeometry`, if the window closes while waiting) |
| `org.gnome.Shell.Extensions.WindowControl.Refused` | The frame is pinned by fullscreen, maximize or tiling — the message names which |
| `org.gnome.Shell.Extensions.WindowControl.Timeout` | `WaitForGeometry` gave up: the frame never settled |
| `org.gnome.Shell.Extensions.WindowControl.Disabled` | The extension was disabled while a deferred call was pending (a wait, or an `ApplyRules` waiting for a rules.json read) |
| `org.freedesktop.DBus.Error.InvalidArgs` | A size or a wait time was not positive, `timeout_ms` was below `quiet_ms`, or a wait selector was refused (unknown kind, empty substring, pid that is not a positive decimal integer) |
| `org.freedesktop.DBus.Error.Failed` | `Move`, `Resize`, `MoveResize` or `ApplyRules` raised something unexpected |
| `org.gnome.gjs.JSError.*` | Any other method threw a JavaScript `Error` unexpectedly; GJS names the D-Bus error after it (`org.gnome.gjs.JSError.TypeError`) |

**Breaking change in extension version 10.** Before it, those three methods
returned `b success`. A client written against the old signature cannot parse
the new reply, so extension and `wctl` must be upgraded together — which is what
`wctl version --json` checks.
