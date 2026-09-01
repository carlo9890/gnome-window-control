# Monitoring

How to inspect the extension's log output and interpret it. To drive/reload the
product see [RUNNING.md](RUNNING.md).

## Viewing logs

Follow this extension's own log lines (filtered by its `Window Control` tag):

```bash
journalctl --user -b -g "Window Control" -f
```

## Log levels

GNOME Shell's `console` API maps to journald priorities that are filtered
differently:

| Function | Level | Visible by default? |
|----------|-------|---------------------|
| `console.log()` | DEBUG | No — filtered out |
| `console.warn()` | WARNING | Yes |
| `console.error()` | CRITICAL | Yes |

To see `console.log()` output, start GNOME Shell (or the nested session) with
`G_MESSAGES_DEBUG=all`. In extension code, reserve `console.error()` for actual
errors so the CRITICAL stream stays meaningful.

## Interpreting common signals

- **`wctl` prints "extension is not running"** — the D-Bus destination isn't
  answering; enable it (`gnome-extensions enable window-control@carlo9890.github.io`). Both
  `wctl` transports classify this the same way via `is_extension_not_running`.
- **`wctl list`/`info`/`focused` return empty or error** — check the log for a
  JavaScript exception in `ListDetailed`; the handler returns `'[]'` on any throw.
- **A method silently no-ops** — the handler caught an exception and returned
  `false`/a default; the `console.error(...)` line in its catch block names the
  method and message.
