# GNOME Window Control

A GNOME Shell extension that provides a D-Bus interface for listing and controlling windows on Wayland. This fills a critical gap: on Wayland, there's no standard way to enumerate windows from the command line (unlike X11's `wmctrl` and `xdotool`).

## Features

- **List windows** - Enumerate all windows with their metadata (ID, title, WM class, workspace, monitor, etc.), with optional workspace, monitor, and class filters
- **Window info** - Get detailed information about any window
- **Window selectors** - Address a window by ID, `focused`, WM class, title, title substring, or PID in every `wctl` command
- **Activate windows** - Focus/raise windows by ID, title, WM class, or PID
- **Move/resize windows** - Position and size windows programmatically
- **Window state control** - Minimize, maximize, fullscreen, always-on-top, sticky
- **Workspaces and monitors** - List them, switch workspace, move a window to a workspace or monitor
- **Wait for a window** - Block until a matching window is shown, without polling
- **Automatic placement** - Place matching windows the moment they are shown, from a config file, with no `wctl` call in the loop
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

Piped from `curl`, the script downloads the published binary. Run from a
checkout, it installs a local build when one exists and downloads otherwise;
`--download` always downloads, `--local` always builds.

Or download `wctl` from the [releases page](https://github.com/carlo9890/gnome-window-control/releases)
and put it on your PATH:
```bash
chmod +x wctl
mv wctl ~/.local/bin/
# or
sudo mv wctl /usr/local/bin/
```

The published binary is x86_64 only; on another architecture build it from a
checkout — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Usage

### Using wctl (Recommended)

```bash
wctl list                          # every window; --json for the full document
wctl focused                       # the focused window
wctl info 12345 --json             # one window's details

# Every command that takes a window accepts a selector instead of an ID:
#   <ID> | focused | -c <CLASS> | -t <TITLE> | -s <SUBSTR> | -p <PID>
# A selector must match exactly one window; otherwise wctl lists the
# candidates and exits 1.
wctl tile -c kitty left
wctl close -s "Untitled"

# Place with workarea-relative tokens: X/Y take pixels or left|center|right /
# top|center|bottom; width/height take pixels or a percentage of the workarea
# (the monitor minus panels and docks).
wctl place 12345 center top 50% 100%

# Wait for a window to be shown, then place it
kitty &
wctl tile "$(wctl wait -p $! --timeout 5)" right

wctl --help                        # every command, global options, and --json/--settled
```

`wctl activate` keeps the extension's first-match rule for `-t`/`-s`/`-c`/`-p`
(useful for run-or-raise scripts). Every other command requires the selector to
be unambiguous.

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

#### Sizing a window before it exists

`resolve-place` answers what a placement would be, without a window and without
moving anything — so a program can be launched at its final size instead of being
moved after it appears:

```bash
read -r w h < <(wctl resolve-place center top 50% 100% --json |
                jq -r '.target | "\(.width) \(.height)"')
```

`place`, `tile` and `center` take `--json` too, reporting the workarea used and
the rectangle computed. All of them report the rectangle wctl **requested**;
mutter still clamps to size hints, and a client that quantises its own size (a
terminal, to whole cells) settles a few pixels off, so comparing against it needs
a tolerance.

#### Waiting for the frame to settle

A geometry request is applied asynchronously, and a client may resize itself once
more after being placed, so the frame can still be moving when `wctl` exits.
`--settled` returns only once it has stopped. The window is placed either way: a
frame that never settles exits 4 and still reports `"placed":true`.

#### Checking the extension version

```bash
wctl version               # just this binary, no D-Bus call
wctl version --json
# {"wctl":"0.12.0","expects_extension":"12","extension":"12","compatible":true,"capabilities":["rules"]}
```

`--json` asks the **running shell** what it has loaded. That is the useful
question: on Wayland an install lands on disk while the shell keeps serving the
old code until you log out, so `metadata.json` can say 10 while the answer here
is still 9. A mismatch exits 5.

`capabilities` is what the extension says it supports, by name. Ask for a name
rather than comparing version numbers: an install from extensions.gnome.org
carries that site's own upload number in `extension`, which no release of this
project ever had. An empty list means the extension is too old to answer.

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

## Automatic window placement

The extension can place a window the moment it is shown, so it opens where you
want it without a `wctl` call. Rules live in
`~/.config/gnome-window-control/rules.json`, a JSON array read at enable and
re-read whenever the file changes (no restart needed). The file is optional; with
no file, nothing happens.

Each rule names the windows it matches and one placement, in the same vocabulary
as the `wctl` commands:

```json
[
  { "match": { "class": "kitty" },        "tile": "left" },
  { "match": { "substr": "Report" },      "place": ["right", "top", "50%", "100%"] },
  { "match": { "title": "Calculator" },   "center": "both", "monitor": 1 },
  { "match": { "class": "Slack" },        "workspace": 2 }
]
```

- **match** — one or more of `class` (exact WM class), `title` (exact title),
  `substr` (title contains). Several keys must all match.
- **place** — `[X, Y, WIDTH, HEIGHT]`, the tokens of `wctl place`: X is a number
  or `left|center|right`, Y a number or `top|center|bottom`, WIDTH/HEIGHT a
  positive number or a percentage like `50%`.
- **tile** — a `wctl tile` position (`left`, `top-right`, `center`, ...).
- **center** — `horizontal`, `vertical`, or `both`; keeps the window's own size.
- **workspace** — a workspace index; the window is moved there (created if needed).
- **monitor** — a monitor index; the workarea that `place`/`tile`/`center`
  resolve against, and where the window is placed.

`place`, `tile` and `center` are mutually exclusive in one rule; combine any of
them with `workspace` and `monitor`. The first matching rule wins, in file order,
and applies once per window.

This sets the *initial* position only: an app that resizes itself afterwards is
left alone. A rule with a bad value is reported to the journal and the whole file
is ignored until you fix it, so one typo never places a window half-right.

### Managing rules from the command line

`wctl` writes and reads the file, so you need not edit JSON by hand:

```bash
wctl rules add -c kitty tile left               # Tile every kitty window left
wctl rules add -s Report place right top 50% 100%
wctl rules add -t Calculator center both --monitor 1 --workspace 2
wctl rules list                                 # What is in the file
wctl rules remove 0                             # Drop a rule by index
wctl rules path                                 # Where the file lives
```

```console
$ wctl rules list
INDEX  MATCH             ACTION                    WORKSPACE  MONITOR
0      class=kitty       tile left
1      substr=Report     place right top 50% 100%
2      title=Calculator  center both               2          1
```

A rule matches with `-c <CLASS>`, `-t <TITLE>` or `-s <SUBSTR>` only. A window
ID, `focused` and `-p <PID>` name a window that already exists, and a rule is
evaluated against windows that do not exist yet, so those are refused.

`add` validates the action through the same grammar `wctl tile` and `wctl place`
use, appends unless `--at <N>` names a position, and writes atomically. A file
that does not parse or does not validate is never rewritten, so a hand-edited
file with a typo in it is not clobbered. `--dry-run` prints the document it
would write and changes nothing. Because the first matching rule wins, `add`
warns when an earlier rule already matches everything the new one would.

Rules are applied only by an extension that reports the `rules` capability
(`wctl version --json` lists it). When the running shell has an older one
loaded, `add` and `remove` still write the file but warn that no rule will be
applied until you install the newer extension and restart the shell. With no
shell running, and with `--file`, they say nothing.

### Checking the file

Because one bad value disables every rule, check the file rather than saving it
and watching whether windows move:

```bash
wctl rules check                      # the configured file
wctl rules check --file ./draft.json  # any file
wctl rules check --json               # for a script
```

```console
$ wctl rules check
/home/you/.config/gnome-window-control/rules.json: 3 rules, valid

$ wctl rules check
Error: rules[1].tile: must be one of top-left, top-center, top-right, left, center, right, bottom-left, bottom-center, bottom-right, wide-left, wide-right
```

It exits 0 when the shell would load the file and 1 when it would not, and the
message is the same one the extension writes to the journal. It reads only the
file: no D-Bus, and it works with the extension stopped or not installed.

### Why did a rule not fire?

```bash
wctl rules test -c kitty
```

```console
$ wctl rules test -c kitty
Window 4152763  class=kitty  title=vim
Matched rule 0: class=kitty -> tile left
  rule 2 also matches but is shadowed: class=kitty -> tile right
  monitor 0, workarea 0,27 1920x1053
  would place at 0,27 480x1052
```

It names the rule that wins, any later rule the first-match-wins order makes
dead, the workarea used, and the exact rectangle the action resolves to. This is
the one `rules` subcommand that needs the extension running, because it resolves
a live window. It never moves anything. Against an extension that does not
report the `rules` capability it exits 5 instead, because that extension
ignores the file.

The complete format, the token grammar, the tile grid and every validation rule
are specified in [docs/specs/RULES-JSON.md](docs/specs/RULES-JSON.md).

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
| `GetCapabilities` | `() -> as` | The feature names this extension supports, e.g. `['rules']` |
| `Minimize` | `(t) -> b` | Minimize window |
| `Unminimize` | `(t) -> b` | Restore minimized window |
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
| `WaitForWindow` | `(ssi) -> t` | Wait until a window matching `kind` (`class`, `title`, `substring`, `pid`) and `value` is shown (mapped and placed), up to `timeout_ms`; returns its ID, or 0 on timeout. The reply is deferred, the shell is never blocked. |
| `WaitForGeometry` | `(tii) -> (iiii)` | Wait until the window's frame has held still for `quiet_ms`, up to `timeout_ms`, then return it. The reply is deferred, the shell is never blocked. |

### Errors

`Move`, `Resize` and `MoveResize` return nothing and raise instead; `WaitForWindow`
and `WaitForGeometry` raise too. The ERRORS block in
`window-control@carlo9890.github.io/dbus-interface.js` names the extension's own
errors; `org.freedesktop.DBus.Error.*` below are the standard names a handler
raises without declaring them there.

| Error name | Meaning |
|------------|---------|
| `org.gnome.Shell.Extensions.WindowControl.NotFound` | No window has that ID (also `WaitForGeometry`, if the window closes while waiting) |
| `org.gnome.Shell.Extensions.WindowControl.Refused` | The frame is pinned by fullscreen, maximize or tiling — the message names which |
| `org.gnome.Shell.Extensions.WindowControl.Timeout` | `WaitForGeometry` gave up: the frame never settled |
| `org.gnome.Shell.Extensions.WindowControl.Disabled` | The extension was disabled while a deferred call was pending |
| `org.freedesktop.DBus.Error.InvalidArgs` | An argument was not a finite number, a size was not positive, or a wait selector was refused (unknown kind, empty substring, pid that is not a positive decimal integer) |
| `org.freedesktop.DBus.Error.Failed` | The handler raised something unexpected |

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

## Contributing & internals

- Repository layout and architecture: [docs/OVERVIEW.md](docs/OVERVIEW.md)
- Building from source, testing, contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Version numbering (`wctl --version` `0.N.0` ↔ release `vN`): [docs/RELEASING.md](docs/RELEASING.md#version-format)

## License

MIT License - see [LICENSE](LICENSE) file.
