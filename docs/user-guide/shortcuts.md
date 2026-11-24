# Keyboard shortcuts and preferences

## Keyboard shortcuts

![The numpad keys 7, 9, 3, 1 and 5 with Super+Ctrl move a window to each corner and the center; the numpad + makes it wide](../images/demo-keyboard.gif)

The extension tiles the focused window from the keyboard, to the same 4x2 grid
`wctl tile` and a rule use. The numpad mirrors the grid; the defaults are
`Super+Ctrl` plus the key, and they work with Num Lock on or off:

| Key | Position | | Key | Position | | Key | Position |
|---|---|---|---|---|---|---|---|
| `7` | `top-left` | | `8` | `top-center` | | `9` | `top-right` |
| `4` | `left` | | `5` | `center` | | `6` | `right` |
| `1` | `bottom-left` | | `2` | `bottom-center` | | `3` | `bottom-right` |

`Super+Ctrl+KP_Add` (the numpad `+`) tiles the window `wide-right`, three
columns of four; press it again on the same window and it goes `wide-left`.
A fullscreen window is left alone. A maximized one is restored first, then
placed, as [Resetting windows to their rules](rules.md#resetting-windows-to-their-rules)
says for a rule.

`Super+Ctrl+KP_Multiply` (the numpad `*`) applies the loaded rules again to
every open window, as `wctl rules apply` does ([Resetting windows to their
rules](rules.md#resetting-windows-to-their-rules)). It does not check the file and
prints no count: a file with an error moves nothing, and the journal and the
Rules page of the preferences window say why.

The default needs a numpad. To use the `*` of the main keyboard, record it on
the Shortcuts page: Super+Shift+8 on a US layout, Super+Shift+`+` on a German
one. The page stores `<Shift><Super>asterisk`, the Shift included, and that
works on both layouts. Do not write `<Super>asterisk` by hand: mutter binds
the key that carries `*` without the Shift, so it fires on Super+8 (US) or
Super+`+` (German), and on US it takes Super+8 from GNOME's "switch to
application 8".

Change a shortcut on the Shortcuts page of the
[preferences window](#preferences-window-and-top-bar-icon). Every shortcut is
also a GSettings key, so a script can change one:

```bash
S=org.gnome.shell.extensions.window-control
D=~/.local/share/gnome-shell/extensions/window-control@carlo9890.github.io/schemas
gsettings --schemadir $D list-recursively $S               # what is bound
gsettings --schemadir $D set $S tile-left "['<Super>KP_Left']"   # rebind one
gsettings --schemadir $D set $S cycle-wide "[]"            # unbind one
gsettings --schemadir $D reset-recursively $S              # back to the defaults
```

The keys are `tile-<position>` for the nine positions, `cycle-wide` and
`apply-rules`. Each
holds a list of accelerators in GTK's `<Super><Control>KP_Home` notation, so one
key can carry several combinations. Pick a chord nothing else binds: when two
bindings share one, mutter gives it to either at random, and the shortcut then
works on one machine and not on the next. `Super+Shift` on the numpad is such
a case, since GNOME 50 uses `Super+Shift+KP_Page_Up`/`KP_Page_Down` to move a
window between workspaces. The numpad names are the Num-Lock-off ones
(`KP_Home`, not `KP_7`); mutter binds the physical key, so they fire in either
state. `--schemadir` is needed because the schema ships with the extension,
not with the system.

`wctl version --json` lists `keybindings` under `capabilities` when the loaded
extension serves the shortcuts.

## Preferences window and top-bar icon

Open the preferences window from the Extensions app, or with:

```bash
gnome-extensions prefs window-control@carlo9890.github.io
```

- **General** turns the top-bar icon on or off. The icon is off by default.
  Its menu has **Apply Rules Again**, which does what the numpad `*` shortcut
  does, and **Settings**, which opens the preferences window.
- **Shortcuts** has one row per shortcut. Click a row and press the new key
  combination: Backspace disables the shortcut, and Esc keeps the old one. The
  first time, GNOME Shell asks whether the preferences window may take the
  system shortcuts. Choose **Allow**: while that question is open, it gets the
  keys you press. The
  arrow button resets a row to its default. A combination that another
  shortcut of this extension holds is refused, pressed or restored by a reset.
  A key without a modifier other than Shift, such as Super, Ctrl or Alt, is
  refused, because GNOME Shell would take it from every app.
- **Rules** is a text editor for `rules.json`. It checks the text as you type,
  with the same validation the extension uses, and underlines the line of the
  first error: for an error in a rule, the line where that rule starts. **Save** is available only for a valid file, and the
  extension reads the saved file at once. **Apply** applies the saved rules to
  every open window, as `wctl rules apply` does. When another program changes
  the file while you have changes that are not saved, the page offers to load
  the new version. Below the editor, **Rule Files from Other Programs** lists
  each [drop-in file](rules.md#drop-in-files-rulesd) with its rule count or its error;
  edit those with the program that owns them.

The extension only reads the rules files. The preferences window writes
`rules.json` when you click **Save**, and never writes a drop-in file.
