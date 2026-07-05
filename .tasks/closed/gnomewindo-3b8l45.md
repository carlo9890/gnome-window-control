---
id: gnomewindo-3b8l45
title: 'Epic Acceptance: D-Bus Testing Complete'
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-83a
blocked_by:
  - gnomewindo-aepq8v
  - gnomewindo-wzfgln
  - gnomewindo-v5lrox
  - gnomewindo-v4evtm
  - gnomewindo-5b4jpb
created: 2026-01-08T15:45:19Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:24:16Z
close_reason: All implemented D-Bus methods tested and logged. MoveToMonitor/MoveToWorkspace excluded from scope by decision.
---

## Gate Criteria
- [ ] debug-dbus.sh tests ALL D-Bus methods from requirements
- [ ] All methods return expected results in nested session
- [ ] Extension logging shows method calls and results
- [ ] Output file documents complete test run
- [ ] No errors or unexpected behavior

## Verification Steps
1. Start nested session: `./scripts/start-nested.sh`
2. In second terminal, set WAYLAND_DISPLAY and DISPLAY
3. Launch test window: `gedit &`
4. Run debug script: `./scripts/debug-dbus.sh`
5. Review output file for any failures
6. Check extension logs: `journalctl --user | grep "Window Control"`

## Owner
beads-verify-agent
