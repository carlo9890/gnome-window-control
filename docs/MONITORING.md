# Monitoring

How to inspect the extension's log output and interpret it. To drive/reload the
product see [RUNNING.md](RUNNING.md).

## Viewing logs

Follow this extension's own log lines (filtered by its `Window Control` tag):

```bash
journalctl --user -b -g "Window Control" -f
```

By default this shows only the enable/disable lifecycle lines. For the per-call
handler logging, restart the shell with `G_MESSAGES_DEBUG=all` (see Log levels).

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

`console.log()` is **not** filtered out. It is the equivalent of a notice, and it
lands in the user's journal on every call.

To reproduce the table yourself:

```bash
systemd-run --user --quiet --wait gjs -c 'console.debug("A"); console.log("B")'
journalctl --user -b --since "1 min ago" -o json | grep -o '"PRIORITY":"[0-9]"'
```

Writing these lines is a coding rule, not a monitoring one — see
[CODING.md](CODING.md) for which level a handler may use and what a line may
contain.

## Interpreting common signals

- **`wctl` prints "extension is not running"** — the D-Bus destination isn't
  answering; enable it
  (`gnome-extensions enable window-control@carlo9890.github.io`).
  `is_extension_not_running` in `cli/src/dbus.rs` lists the error strings that
  produce this message, including the `WindowControl.Disabled` error the
  extension returns when it is disabled while a `WaitForWindow` call is pending.
- **`wctl list`/`info`/`focused` return empty or error** — check the log for a
  JavaScript exception in `ListDetailed`; the handler returns `'[]'` on any throw.
- **A method silently no-ops** — the handler caught an exception and returned
  `false`/a default; the `console.error(...)` line in its catch block names the
  method and message.
