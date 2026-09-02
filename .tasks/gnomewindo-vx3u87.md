---
id: gnomewindo-vx3u87
title: Verify v8 runs under the new UUID before it goes anywhere
status: open
type: task
priority: 1
creator: hans
created: 2026-09-02T06:24:20Z
updated: 2026-09-02T06:24:20Z
---

## Context

v8 is released: https://github.com/carlo9890/gnome-window-control/releases/tag/v8

It carries two changes that have never executed:

- The extension UUID changed from `window-control@hko9890` to
  `window-control@carlo9890.github.io` (commit 72a314f). The extension has never
  been loaded by a shell under the new identity.
- All 42 per-call D-Bus handler logs moved from `console.log()` to
  `console.debug()`, and 7 messages that interpolated a window title or a
  caller-supplied match string were rewritten (commit bec4292).

Merged to main as d73631e. This machine still runs the OLD uuid
(`window-control@hko9890`, enabled and active); nothing was installed for v8.

Gates that did run: `node --check` on both sources, and `bash tests/test-logic.sh`
(71 passed, 0 failed). Those are syntax and pure-logic only.

Gates that did NOT run: `tests/run-all-query-tests.sh` and
`tests/run-all-modification-tests.sh`. GNOME Shell only rescans extensions on
restart (see docs/RUNNING.md), so the new UUID could not load in the session that
produced the release.

## Problem

v8 is published and downloadable while unverified at runtime. Two ways that bites:

1. README.md's "Upgrading from window-control@hko9890" section tells a user to
   `gnome-extensions uninstall window-control@hko9890` BEFORE installing the new
   UUID. A user who follows it destroys a working v7 install and then installs an
   extension that has never been loaded. A trivial load-time error leaves them
   with no working extension.
2. The EGO submission is gated on this. Uploading code that does not load costs a
   full review cycle, which is measured in weeks.

The logging change is the part most likely to be wrong and least likely to be
noticed: `console.debug` output is invisible by default, so a broken handler
would fail silently rather than announce itself.

## Recommended action

Swap this machine to the new UUID and run the two extension-dependent suites,
then confirm the logging fix actually holds by reading the journal.

```bash
gnome-extensions disable window-control@hko9890
gnome-extensions uninstall window-control@hko9890
gnome-extensions install window-control@carlo9890.github.io_v8.zip --force
# log out and log back in (Wayland); Alt+F2 r on X11
gnome-extensions enable window-control@carlo9890.github.io
```

Do not leave both UUIDs enabled — they register the same D-Bus object path.

If anything fails to load, delete the v8 release (`gh release delete v8`) before
fixing, so nobody pulls it in the meantime.

## Acceptance criteria

- [ ] `gnome-extensions info window-control@carlo9890.github.io` reports `State: ACTIVE`
- [ ] `./tests/run-all-query-tests.sh` prints `ALL QUERY TESTS PASSED` (and NOT `NO QUERY TESTS EXECUTED`, which is the skip path)
- [ ] `./tests/run-all-modification-tests.sh` prints `ALL MODIFICATION TESTS PASSED`
- [ ] After running `wctl list`, `wctl focused` and an `activate-title` call, `journalctl --user -b -g "Window Control"` shows only the enable/disable lifecycle lines and contains no window title
- [ ] The per-call logging is still reachable for debugging: in a nested session started with `G_MESSAGES_DEBUG=all` (`./scripts/start-nested.sh`), `journalctl` shows the `console.debug` handler lines
