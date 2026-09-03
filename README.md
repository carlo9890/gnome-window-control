# GNOME Window Control

A GNOME Shell extension that provides a D-Bus interface for listing and controlling windows on Wayland. This fills a critical gap: on Wayland, there's no standard way to enumerate windows from the command line (unlike X11's `wmctrl`).

## Features

- **List windows** - Enumerate all windows with their metadata (ID, title, WM class, workspace, monitor, etc.), with optional workspace, monitor, and class filters
- **Window info** - Get detailed information about any window
- **Window selectors** - Address a window by ID, `focused`, WM class, title, title substring, or PID in every `wctl` command
- **Activate windows** - Focus/raise windows by ID, title, WM class, or PID
- **Move/resize windows** - Position and size windows programmatically
- **Window state control** - Minimize, maximize, fullscreen, always-on-top, sticky
- **Workspaces and monitors** - List them, switch workspace, move a window to a workspace or monitor
- **Wait for a window** - Block until a matching window is shown, without polling
- **CLI-friendly** - Easy to use from shell scripts via `gdbus` or the included `wctl` client, a single static binary with no runtime dependencies

## Compatibility

- GNOME Shell 45-50
- Wayland and X11 sessions

## Installation

### Extension

#### From GitHub Releases (Recommended)

1. Download the latest release from the [GitHub Releases page](https://github.com/carlo9890/gnome-window-control/releases)

2. Install the downloaded zip file:
   ```bash
   gnome-extensions install window-control@carlo9890.github.io_v*.zip --force
   ```

3. Restart GNOME Shell:
   - On X11: Press `Alt+F2`, type `r`, and press Enter
   - On Wayland: Log out and log back in

4. Enable the extension:
   ```bash
   gnome-extensions enable window-control@carlo9890.github.io
   ```

#### Upgrading from window-control@hko9890

The extension UUID changed to `window-control@carlo9890.github.io`. GNOME treats
the new UUID as a separate extension, so the old one keeps running until you
remove it. Both register the same D-Bus object, so do not leave both enabled.

```bash
gnome-extensions disable window-control@hko9890
gnome-extensions uninstall window-control@hko9890
gnome-extensions install window-control@carlo9890.github.io_v*.zip --force
# restart GNOME Shell (Alt+F2 r on X11, log out and back in on Wayland)
gnome-extensions enable window-control@carlo9890.github.io
```

#### From Source (For Development)

Building and installing from source is a contributor task — see
[CONTRIBUTING.md](CONTRIBUTING.md) and [docs/CODING.md](docs/CODING.md).

### wctl CLI (Optional)

`wctl` is a statically linked binary. It needs nothing at runtime — no shell,
no `jq`, no `gdbus`.

Use the install script, which puts `wctl` in `~/.local/bin`:
```bash
curl -fsSL https://github.com/carlo9890/gnome-window-control/releases/latest/download/install-wctl.sh | bash
```

Run from a checkout, it installs a local build when one exists and downloads the
published binary otherwise. `--download` always downloads; `--local` always
builds.

Or download `wctl` from the [releases page](https://github.com/carlo9890/gnome-window-control/releases)
and put it on your PATH:
```bash
chmod +x wctl
mv wctl ~/.local/bin/
# or
sudo mv wctl /usr/local/bin/
```

The published binary is x86_64. On another architecture, build it from a
checkout (needs [mise](https://mise.jdx.dev) for the pinned Rust toolchain):
```bash
./install-wctl.sh --local
```

## Usage

### Using wctl (Recommended)

```bash
# List all windows
wctl list

# List windows as JSON
wctl list --json

# Filter the list by workspace, monitor, or WM class
wctl list --workspace 1
wctl list --class kitty --json

# Get focused window
wctl focused

# Get focused window as JSON
wctl focused --json

# Every command that takes a window accepts a selector instead of an ID:
#   <ID> | focused | -c <CLASS> | -t <TITLE> | -s <SUBSTR> | -p <PID>
# A selector must match exactly one window; otherwise wctl lists the
# candidates and exits 1.
wctl info focused
wctl tile -c kitty left
wctl close -s "Untitled"

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

# Workspaces
wctl workspaces                     # list (index, name, window count, active)
wctl workspace 2                    # switch to workspace 2 (closes the overview if open)
wctl move-to-workspace 12345 2      # move a window to workspace 2

# Monitors
wctl monitors                       # list (index, geometry, scale, primary)
wctl move-to-monitor focused 1      # move the focused window to monitor 1

# Usable area of a monitor: its rectangle minus panels and docks. This, not the
# monitor rectangle `monitors` reports, is what place and tile resolve
# percentages against. With no index the primary monitor is used.
wctl workarea                       # primary monitor
wctl workarea 1 --json              # {"monitor_index":1,"x":...,"width":...}

# Wait for a window to be shown and print its ID (default timeout 10 s, exit 4 on
# timeout). wait returns only once mutter has mapped and placed the window, so
# the geometry command that follows sticks instead of being overridden by the
# initial placement.
kitty &
id=$(wctl wait -p $! --timeout 5)
wctl tile "$id" right

# Help
wctl --help
```

`wctl activate` keeps the extension's first-match rule for `-t`/`-s`/`-c`/`-p`
(useful for run-or-raise scripts). Every other command requires the selector to
be unambiguous.

#### Global options

```bash
# Bound how long a call waits for GNOME Shell to reply. The default is 25 s,
# which is right for a batch script and far too long for a keybinding.
wctl --timeout 2 place focused center top 50% 100%

# Or set it once for a whole script.
export WCTL_TIMEOUT=2
```

`--timeout` must come before the command, and it does not change how long
`wctl wait` waits for a window -- that is `wait --timeout`.

#### Exit codes

A failing `wctl` classifies itself, so a script can tell the cases apart without
matching the message text:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage error, or a failure with no more specific code below |
| 2 | The window, workspace or monitor does not exist |
| 3 | The shell refused: the frame is pinned by maximize, fullscreen or tiling, or the window is held on all workspaces |
| 4 | Timed out waiting for a window, or for the shell to reply |
| 5 | The extension is not usable: not running, or a version this `wctl` cannot rely on |

Code 1 stays the catch-all it always was, so a script that only tests for a
non-zero status is unaffected.

#### Reporting the rectangle a placement resolved to

`place`, `tile` and `center` take `--json`. It reports the workarea used and
the rectangle wctl computed, so a script can verify a placement by comparing
against that instead of reimplementing the percentage arithmetic:

```bash
wctl place focused center top 50% 100% --json
# {"window_id":42,"monitor_index":0,
#  "workarea":{"x":0,"y":27,"width":1920,"height":1053},
#  "target":{"x":480,"y":27,"width":960,"height":1053},
#  "placed":true}
```

A refusal emits the same document with `"placed":false` and a `"message"`, so
stdout carries JSON on both outcomes; the exit code says why (see below).

`resolve-place` answers the same question without a window and without moving
anything, which is what sizing a window *before* it exists needs:

```bash
# What would that placement be on the primary monitor?
wctl resolve-place center top 50% 100% --json
# {"monitor_index":0,
#  "workarea":{"x":0,"y":27,"width":1920,"height":1053},
#  "target":{"x":480,"y":27,"width":960,"height":1053}}

# Size a terminal at launch so its first mapped frame is already final.
read -r w h < <(wctl resolve-place center top 50% 100% --json |
                jq -r '.target | "\(.width) \(.height)"')
```

Both report the rectangle wctl **requested**. Mutter still clamps to size
hints, and a client that quantises its own size (a terminal, to whole cells)
settles a few pixels off, so a comparison against it still needs a tolerance.

`move`, `resize` and `move-resize` have no `--json`: they take literal pixels
and resolve nothing to report.

#### Waiting for the frame to settle

A geometry request is applied asynchronously, and a client may resize itself
again once it has been placed, so the frame can still be moving when `wctl`
exits. `--settled` returns only once it has stopped:

```bash
wctl place focused center top 50% 100% --settled --json
# ... "target":{...},"placed":true,"settled":true,"observed":{...}}
```

The shell watches its own `size-changed`/`position-changed` signals to decide
this, which is the only place it can be decided: `get_frame_rect()` read right
after a move still returns the old rect, so a client outside the shell can only
sample and guess. It is still a quiet period rather than a promise — a client
is free to resize itself again later. The window is placed either way; a frame
that never settles exits 4 and still reports `"placed":true`.

#### Checking the extension version

```bash
wctl version               # just this binary, no D-Bus call
wctl version --json
# {"wctl":"0.10.0","expects_extension":"10","extension":"10","compatible":true}
```

`--json` asks the **running shell** what it has loaded. That is the useful
question: on Wayland an install lands on disk while the shell keeps serving the
old code until you log out, so `metadata.json` can say 10 while the answer here
is still 9. A mismatch exits 5.

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
| `Move` | `(tii) -> ()` | Move window to (x, y). Raises on failure — see **Errors** below |
| `Resize` | `(tii) -> ()` | Resize window to (width, height). Raises on failure |
| `MoveResize` | `(tiiii) -> ()` | Move and resize window. Raises on failure |
| `GetGeometry` | `(t) -> (iiii)` | Get window geometry |
| `GetWorkarea` | `(i) -> (iiii)` | Get a monitor's usable work area |
| `GetVersion` | `() -> s` | The extension version the running shell has **loaded** (not what is on disk) |
| `Minimize` | `(t) -> b` | Minimize window |
| `Unminimize` | `(t) -> b` | Restore minimized window |
| `Maximize` | `(t) -> b` | Maximize window |
| `Unmaximize` | `(t) -> b` | Restore maximized window |
| `Fullscreen` | `(t) -> b` | Make window fullscreen |
| `Unfullscreen` | `(t) -> b` | Exit fullscreen |
| `SetAbove` | `(tb) -> b` | Set/unset always-on-top |
| `SetSticky` | `(tb) -> b` | Set/unset sticky (all workspaces) |
| `ListWorkspaces` | `() -> s` | List workspaces as JSON (`index`, `name`, `is_active`, `window_count`) |
| `ActivateWorkspace` | `(i) -> b` | Switch to a workspace. Hides the Activities overview first (the switch is ignored while it is shown) and returns whether the switch took effect |
| `MoveToWorkspace` | `(ti) -> b` | Move window to a workspace |
| `MoveToMonitor` | `(ti) -> b` | Move window to a monitor |
| `WaitForWindow` | `(ssi) -> t` | Wait until a window matching `kind` (`class`, `title`, `substring`, `pid`) and `value` is shown (mapped and placed), up to `timeout_ms`; returns its ID, or 0 on timeout. The reply is deferred, the shell is never blocked. |
| `WaitForGeometry` | `(tii) -> (iiii)` | Wait until the window's frame has held still for `quiet_ms`, up to `timeout_ms`, then return it. The reply is deferred, the shell is never blocked. |

### Errors

`Move`, `Resize` and `MoveResize` return nothing and raise instead. A boolean
could not say *which* failure happened, and a client outside the shell cannot
work it out for itself: it can read `is_maximized` and `is_fullscreen`, but
mutter exposes no tiled predicate at all.

| Error name | Meaning |
|------------|---------|
| `org.gnome.Shell.Extensions.WindowControl.NotFound` | No window has that ID (also `WaitForGeometry`, if the window closes while waiting) |
| `org.gnome.Shell.Extensions.WindowControl.Refused` | The frame is pinned by fullscreen, maximize or tiling — the message names which |
| `org.gnome.Shell.Extensions.WindowControl.Timeout` | `WaitForGeometry` gave up: the frame never settled |
| `org.gnome.Shell.Extensions.WindowControl.Disabled` | The extension was disabled while a deferred call was pending |
| `org.freedesktop.DBus.Error.InvalidArgs` | An argument was not a finite number, or a size was not positive |

**Breaking change in extension version 10.** Before it, those three methods
returned `b success`. A client written against the old signature cannot parse
the new reply, so extension and `wctl` must be upgraded together — which is what
`wctl version --json` checks.

## Security model

Read this before you enable the extension.

**Any application in your session can call this interface.** The object is
exported on GNOME Shell's own bus name, and the session bus applies no access
control between processes of the same user. Any program you run — a script, a
package's helper daemon, anything started by your desktop — can enumerate your
window titles and move, resize or close your windows.

There is no way to fix this from inside the extension. Same-user processes have
no trust boundary on the session bus: an allowlist keyed on the caller's PID is
useless here (the caller is whatever program invoked the client) and defeated by
the confused deputy, and a shared secret in a file is readable by anything that
can read your files. Any mechanism claiming otherwise would be theater. So the
extension does not pretend to have one — it states plainly what it exposes, and
leaves the decision to you.

What this means in practice:

- **Window titles are the sensitive part.** They carry document names, URLs, and
  message subjects. `List`, `ListDetailed` and `GetFocused` return them, and
  `ActivateByTitleSubstring` and `WaitForWindow` leak them by probing.
- **The extension never writes titles to the journal.** Per-call logging is
  `console.debug()`, gated behind `G_MESSAGES_DEBUG`, and no log line contains a
  title or a caller-supplied match string at any level. See
  [docs/MONITORING.md](docs/MONITORING.md).
- **Nothing runs while the session is locked.** `metadata.json` sets no
  `session-modes`, so it defaults to `user`, and GNOME unloads the extension on
  the lock screen. The interface cannot be queried until you unlock.
- **Disabling the extension removes the interface.** `disable()` unexports the
  object; there are no signal handlers or timers left behind.
- **Well-sandboxed Flatpak applications generally cannot reach it,** because the
  portal-filtered bus does not grant them `org.gnome.Shell` by default. This is a
  property of their sandbox, not of this extension, and it does not apply to an
  application granted full session-bus access.

If that trade is not acceptable to you, do not enable the extension. On X11 the
same capability was available to every application with no gate at all; on
Wayland it is off until you turn it on, and this is the switch.

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
