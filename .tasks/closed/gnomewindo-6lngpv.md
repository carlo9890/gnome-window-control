---
id: gnomewindo-6lngpv
title: Create wctl script with list and focused commands
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-avt
blocked_by:
  - gnomewindo-sbkbxf
created: 2026-01-08T12:15:34Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:25:38Z
close_reason: Created wctl bash script with list, list --json, focused, and help commands. Includes error handling for extension not running.
---

## Description
Create the wctl bash script with the core listing functionality.

## Instructions
1. Create `wctl` bash script with:
   - Shebang: `#!/usr/bin/env bash`
   - Help function showing all commands
   - D-Bus call helper function
   - Error handling for extension not running

2. Implement commands:

### wctl list
- Call List() D-Bus method
- Format as table: ID | TITLE | WM_CLASS | WORKSPACE | MONITOR | FOCUSED
- Truncate long titles (max 40 chars with ...)

### wctl list --json
- Call ListDetailed() D-Bus method
- Output raw JSON (already formatted by extension)

### wctl focused
- Call GetFocused() D-Bus method
- Output: "ID: 12345, Title: Firefox, Class: Firefox"
- Or "No window focused" if (0, "", "")

### wctl --help / wctl help
- Show usage for all commands

## Files to Create
- `wctl` (executable bash script)

## Acceptance Criteria
- [ ] wctl list shows formatted table
- [ ] wctl list --json outputs valid JSON
- [ ] wctl focused shows current window
- [ ] wctl --help shows all commands
- [ ] Graceful error when extension not running

## Notes
- Use gdbus call for D-Bus communication
- Parse gdbus output with sed/awk (it's not JSON)
- Make script executable: chmod +x wctl
