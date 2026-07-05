---
id: gnomewindo-jwdagi
title: Add wctl activation commands
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-ke8
blocked_by:
  - gnomewindo-6lngpv
created: 2026-01-08T12:15:38Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:26:38Z
close_reason: Added activate and focus commands with -t/-s/-c/-p options, proper argument validation, and clear error messages
---

## Description
Add window activation commands to wctl.

## Instructions
Add these commands to wctl:

### wctl activate <id>
- Call Activate(id) D-Bus method
- Output "Window activated" or "Window not found"

### wctl activate -t <title>
- Call ActivateByTitle(title) D-Bus method
- Exact match

### wctl activate -s <substring>
- Call ActivateByTitleSubstring(substring) D-Bus method

### wctl activate -c <class>
- Call ActivateByWmClass(wm_class) D-Bus method

### wctl activate -p <pid>
- Call ActivateByPid(pid) D-Bus method

### wctl focus <id>
- Call Focus(id) D-Bus method

## Files to Modify
- `wctl`

## Acceptance Criteria
- [ ] All activation variants work
- [ ] Clear error messages for not found
- [ ] Flags work correctly (-t, -s, -c, -p)

## Notes
- Use getopts or manual flag parsing
- Quote arguments properly for D-Bus calls
