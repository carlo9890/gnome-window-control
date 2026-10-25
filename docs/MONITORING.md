# Monitoring

How to inspect the extension's log output and interpret it. To drive/reload the
product see [RUNNING.md](RUNNING.md).

## Viewing logs

Follow this extension's own log lines (filtered by its `Window Control` tag):

```bash
journalctl --user -b -g "Window Control" -f
```

`journalctl --user` shows only the main session's shell. A nested session's
output goes to the terminal that ran `./scripts/start-nested.sh`.

Errors and warnings appear by default; the per-call `console.debug()` trace
needs `G_MESSAGES_DEBUG=all` in the shell's environment. In a nested session:
`G_MESSAGES_DEBUG=all GSETTINGS_BACKEND=memory ./scripts/start-nested.sh`. The
main Wayland session cannot be restarted, so it needs the variable in the
session environment before login — use the nested session instead.

## Log levels

GJS maps the `console` API onto GLib log levels, and GLib's journald writer drops
`DEBUG` and `INFO` unless `G_MESSAGES_DEBUG` is set. The mapping (verified on
GNOME Shell 46 by logging one line at each level and reading back `PRIORITY`):

| Function | journald priority | Visible by default? |
|----------|-------------------|---------------------|
| `console.debug()` | 7 (debug) | No — needs `G_MESSAGES_DEBUG` |
| `console.info()` | 6 (info) | No — needs `G_MESSAGES_DEBUG` |
| `console.log()` | 5 (notice) | **Yes** |
| `console.warn()` | 4 (warning) | Yes |
| `console.error()` | 3 (critical) | Yes |

Writing these lines is a review rule, not a monitoring one — see
[REVIEWING.md](REVIEWING.md) for which level a handler may use and what a line
may contain.

## Interpreting common signals

- **`wctl` prints "extension is not running"** — the D-Bus destination isn't
  answering; enable it
  (`gnome-extensions enable window-control@carlo9890.github.io`).
  `is_extension_not_running` in `cli/src/dbus.rs` lists the error names (and,
  for the one case GDBus conflates, the detail text) that produce this message,
  including the `WindowControl.Disabled` error the extension returns when it is
  disabled while a `WaitForWindow` or `WaitForGeometry` call is pending.
- **The message starts with "Cannot connect to the session bus"** — wctl
  reached no bus at all (`map_connect_err` in `cli/src/dbus.rs`); check
  `DBUS_SESSION_BUS_ADDRESS` against the address the message names before you
  touch the extension.
- **`wctl` fails with `org.gnome.gjs.JSError.<name>`** — a handler threw and GJS
  answered for it. GJS logs it as `JS ERROR: Exception in method call: <Method>`,
  without the `Window Control` tag, so the filter above misses it:
  `journalctl --user -b -g "Exception in method call"`.
- **`wctl` fails with `org.freedesktop.DBus.Error.Failed`** — a geometry, wait or
  `GetWorkarea` call threw; the `[Window Control] <Method>() error:` line names
  the method and message.
- **A method silently no-ops** — it answers `false` with no line in the default
  log: no NORMAL window has that ID, an index is out of range, or mutter declined
  the change. The `console.debug()` trace says which: `-> false (window not found)`,
  `-> false (invalid index)` or a bare `-> false`.
