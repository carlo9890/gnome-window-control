# Using wctl

![A terminal types wctl commands: wctl list, then three tile commands put the logs, chat and terminal windows into a layout](../images/demo-wctl.gif)

`wctl help` gives the usage and the options of every command. A command that
takes a `<WINDOW>` takes a [selector](concepts.md#selectors). `place` takes
[workarea](concepts.md#the-workarea)-relative tokens, and `tile` a position of
[the tile grid](concepts.md#the-tile-grid).

## Commands

| Command | Does |
|---|---|
| `wctl list` | List every window, with ID, title and WM class. |
| `wctl focused` | Show the focused window. |
| `wctl info` | Show one window. |
| `wctl workspaces` | List the workspaces. |
| `wctl monitors` | List the monitors. |
| `wctl workarea` | Show the usable area of a monitor. |
| `wctl activate` | Raise and focus a window, and restore it from minimize. |
| `wctl focus` | Focus a window without raising it. |
| `wctl wait` | Wait until a matching window is shown, and print its ID. |
| `wctl move` | Move a window. |
| `wctl resize` | Resize a window. |
| `wctl move-resize` | Move and resize a window in one request. |
| `wctl place` | Place a window with pixels and workarea tokens. |
| `wctl tile` | Tile a window to a grid position. |
| `wctl center` | Center a window. |
| `wctl resolve-place` | Compute a placement without a window, to size a program before it starts. |
| `wctl rules` | List, check, add, remove, test and apply the rules. See [Automatic window placement](rules.md). |

A window with a minimum size above the rectangle, such as a text editor in a
narrow tile, grows to that minimum at the position asked for. `move-resize`,
`place` and `tile` keep the window on the screen; `move` can put it partly off.
| `wctl workspace` | Switch to a workspace. |
| `wctl move-to-workspace` | Move a window to a workspace. |
| `wctl move-to-monitor` | Move a window to a monitor. |
| `wctl minimize` / `unminimize` | Minimize a window, or restore it. |
| `wctl maximize` / `unmaximize` | Maximize a window, or restore it. |
| `wctl fullscreen` / `unfullscreen` | Make a window fullscreen, or end it. |
| `wctl above` | Keep a window on top, or stop it. |
| `wctl sticky` | Show a window on all workspaces, or stop it. |
| `wctl close` | Ask a window to close. |
| `wctl version` | Show the `wctl` version, and with `--json` the loaded extension. |
| `wctl help` | Show the usage. |
| `wctl completion` | Print the bash or zsh completion script. |

## Examples

```bash
# Start a program, wait for its window, then tile it
kitty &
wctl tile "$(wctl wait -p $! --timeout 5)" right

# Hide and show a popup with no minimize animation
wctl minimize -c my-popup --no-animation
wctl unminimize -c my-popup --no-animation

# Read the size a placement would give, before the window exists
read -r w h < <(wctl resolve-place center top 50% 100% --json |
                jq -r '.target | "\(.width) \(.height)"')
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Usage error, or any failure without a specific code |
| 2 | The window, workspace or monitor does not exist |
| 3 | The shell refused: the frame is pinned by maximize, fullscreen or tiling, the window is held on all workspaces, it cannot be minimized, or it is hidden and cannot take the focus |
| 4 | Timed out waiting for a window, or for the shell to reply |
| 5 | The extension is not usable: not running, a version this `wctl` cannot rely on, or one without a capability the command needs. Also a `wctl wait` that is pending when GNOME Shell restarts the extension at the first screen lock after login. |

## Checking the extension version

```bash
wctl version --json
# {"wctl":"0.<N>.0","expects_extension":"<N>","min_extension":"<M>","extension":"<N>","compatible":true,"capabilities":["rules","keybindings","..."]}
```

`--json` asks the running GNOME Shell what it has loaded. After an install, log
out and back in first; see [Install](install.md#from-github-releases).

`compatible` is `true` for an extension from `min_extension` to
`expects_extension`; outside that range the command exits 5. What
`capabilities` lists is in [Capabilities](concepts.md#capabilities).
