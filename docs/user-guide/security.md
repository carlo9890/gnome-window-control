# Security model

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
  [docs/MONITORING.md](../MONITORING.md).
- **The interface and the rules stay up while the session is locked.**
  `metadata.json` declares the `unlock-dialog` session mode, so scripts keep
  working and a window that opens while the screen is locked still gets its
  rule. An application in your session can therefore list window titles and
  move or close windows while you are away, as it can while you are at the
  desk. The lock screen shows nothing from the extension, and the keyboard
  shortcuts are off while the screen is locked or blanked. When an extension
  loaded before this one does not run on the lock screen, the shell restarts
  this one once, at the first lock after login: a `wctl wait` pending then
  ends with exit 5.
- **Disabling the extension removes the interface.** `disable()` unexports the
  object; there are no signal handlers or timers left behind.
- **Well-sandboxed Flatpak applications generally cannot reach it,** because the
  portal-filtered bus does not grant them `org.gnome.Shell` by default. This is a
  property of their sandbox, not of this extension, and it does not apply to an
  application granted full session-bus access.

If that trade is not acceptable to you, do not enable the extension. On X11 the
same capability was available to every application with no gate at all; on
Wayland it is off until you turn it on, and this is the switch.
