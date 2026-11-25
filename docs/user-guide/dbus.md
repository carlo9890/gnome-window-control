# D-Bus interface

A script can call the extension over D-Bus without `wctl`.

**Bus name (dest):** `org.gnome.Shell`  
**Path:** `/org/gnome/Shell/Extensions/WindowControl`  
**Interface:** `org.gnome.Shell.Extensions.WindowControl`

## Using gdbus directly

```bash
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListDetailed

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
| `ActivateByTitle` | `(s) -> b` | Activate by exact title |
| `ActivateByTitleSubstring` | `(s) -> b` | Activate by title substring |
| `ActivateByWmClass` | `(s) -> b` | Activate by WM class |
| `ActivateByPid` | `(i) -> b` | Activate by process ID |
| `Focus` | `(t) -> b` | Focus window without raising it |
| `Close` | `(t) -> b` | Ask the window to close |
| `GetFocused` | `() -> (tss)` | The focused window: ID, title, class |
| `Move` | `(tii) -> ()` | Move window to (x, y). Raises on failure; see [Errors](#errors) |
| `Resize` | `(tii) -> ()` | Resize window to (width, height). Raises on failure |
| `MoveResize` | `(tiiii) -> ()` | Move and resize window. Raises on failure |
| `ApplyRules` | `(t) -> u` | Apply the loaded rules again: `0` for every open window, else that window. Returns how many windows a rule matched |
| `GetGeometry` | `(t) -> (iiii)` | Window geometry |
| `GetWorkarea` | `(i) -> (iiii)` | Workarea of a monitor; `(-1, -1, -1, -1)` when the index is not a monitor |
| `GetVersion` | `() -> s` | The extension version that the running shell has loaded |
| `GetCapabilities` | `() -> as` | The feature names this extension supports, such as `['rules']` |
| `Minimize` | `(t) -> b` | Minimize window; `false` also when the shell does not let it minimize |
| `Unminimize` | `(t) -> b` | Restore minimized window |
| `MinimizeNoAnimation` | `(t) -> b` | `Minimize` without the animation |
| `UnminimizeNoAnimation` | `(t) -> b` | `Unminimize` without the animation |
| `ActivateNoAnimation` | `(t) -> b` | `Activate`; restores a minimized window without the animation |
| `Maximize` | `(t) -> b` | Maximize window |
| `Unmaximize` | `(t) -> b` | Restore maximized window |
| `Fullscreen` | `(t) -> b` | Make window fullscreen |
| `Unfullscreen` | `(t) -> b` | Exit fullscreen |
| `SetAbove` | `(tb) -> b` | Set or unset always-on-top |
| `SetSticky` | `(tb) -> b` | Set or unset on all workspaces; `false` when the window is not in the requested state after the call |
| `ListWorkspaces` | `() -> s` | List workspaces as JSON (`index`, `name`, `is_active`, `window_count`) |
| `ActivateWorkspace` | `(i) -> b` | Hide the overview, switch to a workspace; `false` when that workspace is not active after the call |
| `MoveToWorkspace` | `(ti) -> b` | Move window to a workspace |
| `MoveToMonitor` | `(ti) -> b` | Move window to a monitor |
| `WaitForWindow` | `(ssi) -> t` | Wait up to `timeout_ms` until a window that matches `kind` (`class`, `title`, `substring`, `pid`) and `value` is shown. Returns its ID, or 0 on timeout. The shell does not block |
| `WaitForGeometry` | `(tii) -> (iiii)` | Wait up to `timeout_ms` until the frame of the window has not changed for `quiet_ms` and the window has answered the new size or restore that a geometry method, a rule or a shortcut asked of it (at most 2 s for a size, 1 s for a restore), then return it. The shell does not block |

## Errors

`Move`, `Resize`, `MoveResize`, `ApplyRules`, `WaitForWindow` and
`WaitForGeometry` raise one of these names on failure:

| Error name | Meaning |
|------------|---------|
| `org.gnome.Shell.Extensions.WindowControl.NotFound` | No window has that ID, or the window closed during `WaitForGeometry` |
| `org.gnome.Shell.Extensions.WindowControl.Refused` | Fullscreen, maximize or tiling holds the frame; the message names which |
| `org.gnome.Shell.Extensions.WindowControl.Timeout` | `WaitForGeometry`: the frame did not settle, or the window did not answer within `timeout_ms` |
| `org.gnome.Shell.Extensions.WindowControl.Disabled` | The extension was disabled during a wait, or while `ApplyRules` waited for a rules read |
| `org.freedesktop.DBus.Error.InvalidArgs` | A size or wait time that is not positive, `timeout_ms` below `quiet_ms`, or a wait selector that is not valid |
| `org.freedesktop.DBus.Error.Failed` | `Move`, `Resize`, `MoveResize` or `ApplyRules` failed in an unexpected way |

When another method fails in an unexpected way, the error name is
`org.gnome.gjs.JSError.<name>`, such as `org.gnome.gjs.JSError.TypeError`.
Before GNOME 50, a wait method that fails before it starts to wait sends no
reply; the D-Bus timeout of the caller ends the call.

Before extension version 10, `Move`, `Resize` and `MoveResize` returned `b`;
extensions.gnome.org can still serve such a version.
