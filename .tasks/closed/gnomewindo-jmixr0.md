---
id: gnomewindo-jmixr0
title: Implement wctl tile command
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-mou
blocked_by:
  - gnomewindo-9jhz3k
  - gnomewindo-oqq1hd
created: 2026-01-09T19:29:53Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T16:08:57Z
---

## Description

Add the `tile` command to wctl that positions windows on a 4x2 grid, matching gTile's preset layout.

## Instructions

1. Add `cmd_tile` function to `wctl` script
2. Parse position argument and map to grid coordinates
3. Get workarea from extension via new GetWorkarea method
4. Calculate pixel positions based on grid
5. Call existing `MoveResize` to position window

## Grid Layout (4 columns × 2 rows)

```
+----------+---------------------+----------+
| top-left |     top-center      | top-right|
| (col 1)  |    (cols 2-3)       | (col 4)  |
+----------+---------------------+----------+
| bot-left |    bottom-center    | bot-right|
| (col 1)  |    (cols 2-3)       | (col 4)  |
+----------+---------------------+----------+

Full height positions:
- left: col 1, rows 1-2
- center: cols 2-3, rows 1-2  
- right: col 4, rows 1-2
```

## Position Mapping

| Position | Start Col | End Col | Start Row | End Row |
|----------|-----------|---------|-----------|---------|
| top-left | 1 | 1 | 1 | 1 |
| top-center | 2 | 3 | 1 | 1 |
| top-right | 4 | 4 | 1 | 1 |
| left | 1 | 1 | 1 | 2 |
| center | 2 | 3 | 1 | 2 |
| right | 4 | 4 | 1 | 2 |
| bottom-left | 1 | 1 | 2 | 2 |
| bottom-center | 2 | 3 | 2 | 2 |
| bottom-right | 4 | 4 | 2 | 2 |

## Calculation Logic

```bash
cell_width=$((workarea_width / 4))
cell_height=$((workarea_height / 2))

# Example: top-center (cols 2-3, row 1)
x=$((workarea_x + cell_width * 1))  # start at col 2 (0-indexed: 1)
y=$((workarea_y + 0))                # start at row 1
width=$((cell_width * 2))            # span 2 columns
height=$((cell_height * 1))          # span 1 row
```

## CLI Interface

```bash
wctl tile <window_id> <position>

# Valid positions:
# top-left, top-center, top-right
# left, center, right
# bottom-left, bottom-center, bottom-right
```

## Files to Modify

- `wctl` - add cmd_tile function and case in main

## Acceptance Criteria

- [ ] All 9 positions work correctly
- [ ] Calculation is resolution-independent
- [ ] Uses workarea (respects panels/docks)
- [ ] Clear error messages for invalid positions
- [ ] Help text updated

## Dependencies

Depends on: GetWorkarea D-Bus method being implemented first
