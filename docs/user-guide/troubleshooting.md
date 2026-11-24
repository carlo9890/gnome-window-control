# Troubleshooting

Find the symptom and apply the fix. The cause of each is on the page it links
to.

## wctl exits 5

Cause: the extension is not usable, or it lacks a capability the command
needs. See [Exit codes](wctl.md#exit-codes).

Fix: run `wctl version --json`. When `compatible` is false, install a newer
extension from [Install](install.md) and enable it; see
[Checking the extension version](wctl.md#checking-the-extension-version).
When `compatible` is true, compare `capabilities` with what the command needs:
see [Keys that need a newer extension](rules.md#keys-that-need-a-newer-extension),
[Resetting windows to their rules](rules.md#resetting-windows-to-their-rules)
and, for a `wctl wait` that ends at the first lock, [Security model](security.md).

## The extension from extensions.gnome.org has no rules or shortcuts

Cause: see [From extensions.gnome.org](install.md#from-extensionsgnomeorg).

Fix: install from [GitHub Releases](install.md#from-github-releases).

## A new version is installed, but the old one still runs

Cause: see [Checking the extension version](wctl.md#checking-the-extension-version).

Fix: log out and log back in. Then run `wctl version --json` and check
`extension`.

## A rule does not fire

Cause: see [Why did a rule not fire?](rules.md#why-did-a-rule-not-fire).

Fix: run `wctl rules test` with a selector for the window, for example
`wctl rules test -c kitty`.

## Every rule stopped

Cause: see [Automatic window placement](rules.md) and
[Checking the file](rules.md#checking-the-file).

Fix: run `wctl rules check`; it names the bad value.

## An edit to a linked rules.json is not seen

Cause: see [Managing rules from the command line](rules.md#managing-rules-from-the-command-line).

Fix: run `touch -h ~/.config/gnome-window-control/rules.json` after the edit.

## A shortcut does not fire, or fires on one machine only

Cause: see [Keyboard shortcuts](shortcuts.md#keyboard-shortcuts).

Fix: record a chord nothing else binds on the Shortcuts page of the
[preferences window](shortcuts.md#preferences-window-and-top-bar-icon). With no
numpad, record a key of the main keyboard there.

## A window lands a few pixels off

Cause: see [Sizing a window before it exists](wctl.md#sizing-a-window-before-it-exists).

Fix: compare the result with the requested rectangle with a tolerance, and add
`--settled`; see [Waiting for the frame to settle](wctl.md#waiting-for-the-frame-to-settle).
