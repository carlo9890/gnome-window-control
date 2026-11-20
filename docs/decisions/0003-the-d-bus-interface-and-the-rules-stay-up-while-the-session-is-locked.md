# 0003: The D-Bus interface and the rules stay up while the session is locked

`metadata.json` declares the `unlock-dialog` session mode, so scripts keep working and a window
that opens while the screen is locked still gets its rule. The cost: an application in the session
can list window titles and move or close windows while the user is away.

Rejected: no `session-modes` entry, because GNOME Shell then disables the extension at every lock:
`wctl` fails for the whole lock, and a window that opens then is not placed by its rule.
