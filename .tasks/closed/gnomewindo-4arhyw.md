---
id: gnomewindo-4arhyw
title: Create wctl info command
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-o3y
created: 2026-01-08T17:03:55Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:06:52Z
close_reason: Created cmd_info function with table/JSON output, removed geometry command, updated help text
---

## Description
Create a new `wctl info <ID>` command that shows all details for a single window, replacing the geometry command.

## Instructions
1. Create `cmd_info()` function that:
   - Takes window ID as argument
   - Calls ListDetailed to get JSON
   - Filters to find the window with matching ID
   - Displays info in table format by default
   - With `--json` flag, outputs raw JSON for that window

2. Table output format:
   ```
   Window: 12345
   Title: My Window Title
   Class: Firefox
   Instance: Navigator
   PID: 1234
   Workspace: 0
   Monitor: 0
   Focused: yes
   Position: 100, 200
   Size: 800 x 600
   States: maximized, above
   ```

3. JSON output (--json flag):
   - Output the full window object from ListDetailed

4. Remove `cmd_geometry()` function (absorbed into info)
5. Update help text

## Files to Modify
- wctl

## Acceptance Criteria
- [ ] `wctl info <ID>` shows table output
- [ ] `wctl info <ID> --json` shows JSON output
- [ ] geometry command removed
- [ ] Help text updated
- [ ] Error handling for invalid/missing ID
