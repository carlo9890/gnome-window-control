---
id: gnomewindo-b6yhi8
title: Implement wctl center command
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-j4i
blocked_by:
  - gnomewindo-9jhz3k
  - gnomewindo-oqq1hd
created: 2026-01-09T19:30:06Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T16:08:57Z
---

## Description

Add the `center` command to wctl that centers a window horizontally, vertically, or both.

## Instructions

1. Add `cmd_center` function to `wctl` script
2. Get current window geometry via GetGeometry
3. Get workarea for window's monitor
4. Calculate centered position based on axis mode
5. Call Move to reposition window (keep size unchanged)

## Calculation Logic

```bash
# Center horizontally
new_x=$((workarea_x + (workarea_width - window_width) / 2))

# Center vertically  
new_y=$((workarea_y + (workarea_height - window_height) / 2))
```

## CLI Interface

```bash
wctl center <window_id> [horizontal|vertical|both]

# Examples:
wctl center 12345              # center both (default)
wctl center 12345 both         # explicit both
wctl center 12345 horizontal   # center horizontally only (keep y)
wctl center 12345 vertical     # center vertically only (keep x)

# Short forms (optional nice-to-have):
wctl center 12345 h            # horizontal
wctl center 12345 v            # vertical
```

## Files to Modify

- `wctl` - add cmd_center function and case in main

## Acceptance Criteria

- [ ] Default (no axis arg) centers both axes
- [ ] horizontal mode only changes x position
- [ ] vertical mode only changes y position
- [ ] both mode centers on both axes
- [ ] Window size is preserved
- [ ] Works within workarea bounds
- [ ] Help text updated

## Dependencies

Depends on: GetWorkarea D-Bus method being implemented first
