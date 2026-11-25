# Troubleshooting

Find the symptom, then apply the fix.

## wctl exits 5

The extension does not run, or it does not have a capability the command
needs. Run `wctl version --json` and read `extension`; see
[Checking the extension version](wctl.md#checking-the-extension-version).

- `extension` is `null`: enable the extension, or install a current one; see
  [Install](install.md).
- `extension` is below `min_extension`: install a newer extension.
- `extension` is above `expects_extension`: install a newer `wctl`; see
  [Install: wctl](install.md#wctl).
- `compatible` is true: the extension does not report a capability that the
  command or the rules file needs; see
  [Keys that need a newer extension](rules.md#keys-that-need-a-newer-extension).

## The extension from extensions.gnome.org has no rules or shortcuts

See [From extensions.gnome.org](install.md#from-extensionsgnomeorg).

## A new version is installed, but the old one still runs

See [Install](install.md#from-github-releases), step 3, then check `extension`
in `wctl version --json`.

## A rule does not fire

Run `wctl rules test` with a selector for the window, for example
`wctl rules test -c kitty`. See
[Why did a rule not fire?](rules.md#why-did-a-rule-not-fire).

## The rules of one file stopped

A bad value stops the rules of its own file. Run `wctl rules check`; it names
the bad value. See [Checking the file](rules.md#checking-the-file).

## An edit to a linked rules.json is not seen

Run `touch -h ~/.config/gnome-window-control/rules.json` after the edit. See
[Managing rules from the command line](rules.md#managing-rules-from-the-command-line).

## A shortcut does not fire, or fires on one machine only

Another binding can hold the chord, or the machine has no numpad. Record a
chord that nothing else binds on the Shortcuts page of the
[preferences window](shortcuts.md#preferences-window-and-top-bar-icon). With
no numpad, record a key of the main keyboard. See
[Pick a free chord](shortcuts.md#pick-a-free-chord) and
[Use a key of the main keyboard](shortcuts.md#use-a-key-of-the-main-keyboard).

## A window lands a few pixels off

An app can change the size you ask for, and its frame can move for a short
time after the call. Add `--settled` to the command, and compare the result
with the requested rectangle with a tolerance. `wctl help` describes
`--settled`.
