# Security model

Read this before you enable the extension.

**Any application in your session can call the extension.** It exports its
D-Bus object on GNOME Shell's own bus name. The session bus has no access
control between processes of one user, so the extension cannot limit who
calls it: a PID allowlist names only the client program, and a secret in a
file is readable by every program that can read your files. Any program you
run can list your window titles and move, resize or close your windows.

- **Window titles are the sensitive part.** They hold document names, URLs and
  message subjects. `List`, `ListDetailed` and `GetFocused` return them, and
  `ActivateByTitleSubstring` and `WaitForWindow` reveal them by probing.
- **The journal gets no titles.** Debug lines appear only when
  `G_MESSAGES_DEBUG` is set; no line holds a window title.
- **The interface and the rules stay up while the screen is locked.** Scripts
  keep working, and a window that opens then still gets its rule. So an
  application can list titles and move or close windows while you are away.
  The lock screen shows nothing from the extension, and the keyboard shortcuts
  are off while the screen is locked.
- **Disabling the extension removes the interface.**
- **A sandboxed Flatpak application usually cannot reach it**, because its
  filtered bus does not grant `org.gnome.Shell`. An application with full
  session-bus access can.

If you do not accept this, do not enable the extension.
