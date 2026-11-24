# Getting started

This tutorial takes you from a new install to a window that opens in place. It
uses `kitty` as the example application; use the WM class of an application you
have.

## 1. Install

Install the extension and the `wctl` CLI: see [Install](install.md). After an
install from a zip file, restart GNOME Shell and enable the extension, as steps
3 and 4 of [From GitHub Releases](install.md#from-github-releases) say.

## 2. Check the extension

```bash
wctl version --json
# {"wctl":"0.17.0","expects_extension":"17","min_extension":"16","extension":"17","compatible":true,"capabilities":["rules","rules-title-affix","rules-class-prefix","keybindings","no-animation","activate-no-animation"]}
```

`compatible` must be `true`,
and `capabilities` must list `rules` and `keybindings` (see
[Capabilities](concepts.md#capabilities)). When the command exits 5,
the extension is not usable: see
[Checking the extension version](wctl.md#checking-the-extension-version).

## 3. List the windows

```bash
wctl list                                  # every window, with ID, class and title
```

In the list, find the class of the window to move.

## 4. Tile a window

```bash
wctl tile -c kitty left                    # tile the kitty window to the left column
```

`-c kitty` is a selector: it must match exactly one window. See
[Selectors](concepts.md#selectors).

## 5. Add a first rule

```bash
wctl rules add -c kitty tile left               # Tile every kitty window left
```

Open a new kitty window. The extension places it the moment it is shown, with
no `wctl` call. When it does not move, see
[Why did a rule not fire?](rules.md#why-did-a-rule-not-fire).

## 6. Press a shortcut

Focus a window and press `Super+Ctrl` plus a numpad key: `4` tiles it `left`,
`6` tiles it `right`, `5` tiles it `center`. The numpad `*` applies the rules
again to every open window. See [Keyboard shortcuts](shortcuts.md#keyboard-shortcuts).

## Next steps

- Selectors, the workarea and the tile grid: [Concepts](concepts.md)
- The `wctl` commands, exit codes and placement: [Using wctl](wctl.md)
- The complete rules format: [Automatic window placement](rules.md)
- Rebind the shortcuts or edit the rules in a window:
  [Keyboard shortcuts and preferences](shortcuts.md)
- Who can call the interface: [Security model](security.md)
- A problem: [Troubleshooting](troubleshooting.md)
