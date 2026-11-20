# 0005: The geometry methods, ApplyRules and the wait methods raise named D-Bus errors

`Move`, `Resize`, `MoveResize`, `ApplyRules`, `WaitForWindow` and `WaitForGeometry` declare no
`success` out-argument: each completes, or it raises a D-Bus error whose name is the cause. Only
the extension sees why a frame request fails: no window has that ID, or fullscreen, maximize or
tiling holds the frame.

Rejected: a boolean `success` result, because a bare false cannot say which failure happened, and a
client that reads the window flags again cannot see tiling.
