# Getting started

This tutorial takes you from a new install to a window that opens in place. It
uses `kitty` as the example; use the WM class of an application you have.

## 1. Install

Install the extension and `wctl` as [Install](install.md) says.

## 2. Check the extension

```bash
wctl version --json
```

`compatible` must be `true`, and `capabilities` must list `rules` and
`keybindings`. If not, see
[Checking the extension version](wctl.md#checking-the-extension-version).

## 3. List the windows

```bash
wctl list
```

Find the class of the window to move.

## 4. Tile a window

```bash
wctl tile -c kitty left
```

`-c kitty` is a [selector](concepts.md#selectors): it must match exactly one
window.

## 5. Add a first rule

```bash
wctl rules add -c kitty tile left
```

Open a new kitty window. The extension places it when it is shown. If it does
not move, see [Why did a rule not fire?](rules.md#why-did-a-rule-not-fire).

## 6. Press a shortcut

Focus a window and press `Super+Ctrl` plus a numpad key: `4` tiles it `left`,
`6` `right`, `5` `center`. The numpad `*` applies the rules again to every open
window. See [Keyboard shortcuts](shortcuts.md#keyboard-shortcuts).

## Next steps

- [Concepts](concepts.md): selectors, the workarea and the tile grid.
- [Using wctl](wctl.md): every command and the exit codes.
- [Automatic window placement](rules.md): the rules format.
- [Keyboard shortcuts and preferences](shortcuts.md): rebind a key, edit the
  rules in a window.
- [Troubleshooting](troubleshooting.md).
