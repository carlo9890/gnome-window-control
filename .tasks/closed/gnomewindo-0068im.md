---
id: gnomewindo-0068im
title: Create modification tests for wctl
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-06p
blocked_by:
  - gnomewindo-4arhyw
created: 2026-01-08T17:04:11Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:13:02Z
close_reason: Created test-modifications.sh and run-all-modification-tests.sh, all 20 tests pass. Also fixed wctl to remove type prefixes from gdbus calls for GNOME 46 compatibility.
---

## Description
Create comprehensive tests for all state-modifying wctl commands using a controlled test window.

## Instructions
1. Create `tests/test-modifications.sh` that:
   - Spawns a kitty window with title "auto-test:stop-gap"
   - Waits for window to appear
   - Gets window ID via `wctl list --json`
   - Runs through ALL modifying commands in sequence
   - Verifies each change using `wctl info <id> --json`
   - Cleans up (closes) test window at end

2. Commands to test (in order):
   - move <id> 100 100 - verify position changed
   - resize <id> 800 600 - verify size changed
   - move-resize <id> 200 200 900 700 - verify both changed
   - minimize <id> - verify minimized state
   - unminimize <id> - verify not minimized
   - maximize <id> - verify maximized state
   - unmaximize <id> - verify not maximized
   - fullscreen <id> - verify fullscreen state
   - unfullscreen <id> - verify not fullscreen
   - above <id> on - verify above state
   - above <id> off - verify not above
   - sticky <id> on - verify on all workspaces
   - sticky <id> off - verify not sticky
   - activate <id> - verify focused
   - focus <id> - verify focused (may be same)
   - activate -t "auto-test:stop-gap" - verify by title
   - activate -s "auto-test" - verify by substring
   - activate -c "kitty" - verify by class
   - to-monitor <id> 0 - verify monitor (if multi-monitor)
   - close <id> - verify window gone

3. Create `tests/run-all-modification-tests.sh` runner

## Test Window Setup
```bash
# Spawn test window
kitty --title "auto-test:stop-gap" &
sleep 1

# Find window ID
window_id=$(wctl list --json | jq -r '.[] | select(.title == "auto-test:stop-gap") | .id')
```

## Files to Create
- tests/test-modifications.sh
- tests/run-all-modification-tests.sh

## Acceptance Criteria
- [ ] Test window spawns and is detected
- [ ] All modifying commands tested
- [ ] Each command's effect verified via info --json
- [ ] Test window cleaned up at end
- [ ] Clear pass/fail output
- [ ] Handles missing kitty gracefully
