# Troubleshooting

Find the symptom, read the cause, and apply the fix. Each section links to the
page that has the full detail.

## wctl exits 5

Cause: the extension is not usable: not running, or a version this `wctl`
cannot rely on. A version before v25 installed from extensions.gnome.org is
such a case: `wctl version --json` reports `"compatible": false` for it.

Fix: run `wctl version --json` and read `compatible`; see
[Checking the extension version](wctl.md#checking-the-extension-version).
Install the extension from [Install](install.md) and enable it.

## The extension from extensions.gnome.org has no rules or shortcuts

Cause: that page can be several versions behind the GitHub release, and an
older version has no rules and no keyboard shortcuts.

Fix: run `wctl version --json` and read `capabilities`; see
[From extensions.gnome.org](install.md#from-extensionsgnomeorg). Install from
[GitHub Releases](install.md#from-github-releases) for the current
version.

## A new version is installed, but the old one still runs

Cause: on Wayland an install lands on disk while the shell keeps serving the
old code until you log out.

Fix: log out and log back in. Then run `wctl version --json`: it asks the
running shell what it has loaded. See
[Checking the extension version](wctl.md#checking-the-extension-version).

## A rule does not fire

Cause: an earlier rule matches the window first, the rule names a monitor that
does not exist, or the extension refuses a key the file uses.

Fix: run `wctl rules test` with a selector for the window, for example
`wctl rules test -c kitty`. See [Why did a rule not fire?](rules.md#why-did-a-rule-not-fire)
and [Keys that need a newer extension](rules.md#keys-that-need-a-newer-extension).

## Every rule stopped

Cause: a rule with a bad value is reported to the journal and the whole file
is ignored until you fix it. A drop-in file with a bad value is ignored on its
own; the other files still load.

Fix: run `wctl rules check`; it names the bad value. See
[Checking the file](rules.md#checking-the-file).

## An edit to a linked rules.json is not seen

Cause: the extension watches the directory of `rules.json`, not the linked
file, so an edit you make to the linked file is not seen.

Fix: run `touch -h ~/.config/gnome-window-control/rules.json` after such an
edit, or disable and enable the extension, to load it. See
[Managing rules from the command line](rules.md#managing-rules-from-the-command-line).

## A shortcut does not fire, or fires on one machine only

Cause: when two bindings share one chord, mutter gives it to either at random,
and the shortcut then works on one machine and not on the next. `Super+Shift`
on the numpad is such a case, since GNOME 50 uses
`Super+Shift+KP_Page_Up`/`KP_Page_Down` to move a window between workspaces.
The default shortcuts need a numpad.

Fix: pick a chord nothing else binds, on the Shortcuts page of the preferences
window. With no numpad, record a key of the main keyboard there. Run
`wctl version --json` and check that `capabilities` lists
`keybindings`. See [Keyboard shortcuts](shortcuts.md#keyboard-shortcuts).

## A window lands a few pixels off

Cause: mutter clamps to size hints, and a client that quantises its own size
(a terminal, to whole cells) settles a few pixels off. A window with a minimum
size above the rectangle grows to that minimum at the position asked for.

Fix: compare the result against the requested rectangle with a tolerance.
`--settled` returns only once the frame has stopped moving. See
[Sizing a window before it exists](wctl.md#sizing-a-window-before-it-exists)
and [Waiting for the frame to settle](wctl.md#waiting-for-the-frame-to-settle).
