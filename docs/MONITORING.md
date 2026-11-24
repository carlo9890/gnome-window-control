# Monitoring

## Logs

```bash
journalctl --user -b -g "Window Control|JS ERROR" -f
```

- `Window Control` tags every line the extension writes. `JS ERROR` lines are
  untagged throws that GJS logged for it: a D-Bus handler, a rule placement or
  a shortcut.
- `journalctl --user` shows the main session only. A nested or headless shell
  writes a new log file per run; its start script prints the path.

## Levels

GLib's journald writer drops `debug` and `info` unless `G_MESSAGES_DEBUG` is
set in the shell's environment.

| Call | journald priority | Shown by default |
|---|---|---|
| `console.debug()` | 7 | No |
| `console.info()` | 6 | No |
| `console.log()` | 5 | Yes |
| `console.warn()` | 4 | Yes |
| `console.error()` | 3 | Yes |

The per-call trace is `console.debug()`. To see it, start the shell with the
variable: `G_MESSAGES_DEBUG=all ./scripts/start-nested.sh` (or
`start-headless.sh`). The main session gets it only at login, so use a nested
or headless shell ([RUNNING.md](RUNNING.md)). Which level a line may use is in
[REVIEWING.md](REVIEWING.md).

## What a wctl error means

| wctl shows | Cause |
|---|---|
| "extension is not running" | One of the error names in `is_extension_not_running` (`cli/src/dbus.rs`) came back, or `UnknownMethod` while no object is served at the path. Enable the extension as [RUNNING.md](RUNNING.md) says. |
| "Cannot connect to the session bus" | wctl reached no bus. Compare `DBUS_SESSION_BUS_ADDRESS` with the address in the message before you touch the extension. |
| `org.gnome.gjs.JSError.<name>` | A handler threw and GJS answered for it. GJS logs `JS ERROR: Exception in method call: <Method>`. |
| `org.freedesktop.DBus.Error.Failed` | `Move`, `Resize`, `MoveResize` or `ApplyRules` threw. The `[Window Control] <Method>() error:` line has the message. |
| A D-Bus timeout on `wctl wait` | On GNOME 45-49, the wait handler threw and GJS sent no reply. The `JS ERROR` line names the cause. |

A thrown `GLib.Error` goes to the caller as its own GError, with no log line.

## A silent no-op

A method that answers `false` writes no line at the default levels. The
`console.debug()` trace says why:

| Trace ends in | Cause |
|---|---|
| `-> false (window not found)` | No normal window has that ID. |
| `-> false (not found)` | No window matches the `ActivateBy*` value. |
| `-> false (invalid index)` | The workspace or monitor index is out of range. |
| `-> false` | Mutter declined the change. |
