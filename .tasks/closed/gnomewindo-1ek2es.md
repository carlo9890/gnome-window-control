---
id: gnomewindo-1ek2es
title: Window Tiling & Centering Commands
status: closed
type: epic
priority: 2
creator: hans
labels:
  - beads:stop-gap-5rc
blocked_by:
  - gnomewindo-cvsr11
created: 2026-01-09T19:29:21Z
updated: 2026-01-18T16:35:49Z
closed: 2026-01-18T17:35:49Z
close_reason: Epic completed and released as v5. All features implemented and tested.
---

## Description

Add gTile-like window tiling functionality and centering commands to wctl, allowing windows to be positioned on a configurable grid layout directly from the command line.

## Goals

- Provide all gTile preset positions via `wctl tile` command
- Add window centering with `wctl center` command
- Work with any monitor resolution (dynamic calculation)
- Support multi-monitor setups (use window's current monitor)

## User's Current gTile Setup

4-column × 2-row grid on 5120x1440 ultrawide:

| Position | gTile Key | Grid Cells |
|----------|-----------|------------|
| top-left | KP_7 | col 1, row 1 |
| top-center | KP_8 | cols 2-3, row 1 |
| top-right | KP_9 | col 4, row 1 |
| left | KP_4 | col 1, rows 1-2 |
| center | KP_5 | cols 2-3, rows 1-2 |
| right | KP_6 | col 4, rows 1-2 |
| bottom-left | KP_1 | col 1, row 2 |
| bottom-center | KP_2 | cols 2-3, row 2 |
| bottom-right | KP_3 | col 4, rows 1-2 |

## Proposed CLI Interface

### Tile Command
```bash
wctl tile <window_id> <position>

# Positions (matching numpad layout):
wctl tile 12345 top-left      # KP_7
wctl tile 12345 top-center    # KP_8  
wctl tile 12345 top-right     # KP_9
wctl tile 12345 left          # KP_4
wctl tile 12345 center        # KP_5
wctl tile 12345 right         # KP_6
wctl tile 12345 bottom-left   # KP_1
wctl tile 12345 bottom-center # KP_2
wctl tile 12345 bottom-right  # KP_3
```

### Center Command
```bash
wctl center <window_id> [horizontal|vertical|both]

# both is default
wctl center 12345              # center both axes
wctl center 12345 horizontal   # center horizontally only
wctl center 12345 vertical     # center vertically only
```

## Technical Requirements

1. Extension needs to expose monitor workarea (usable space minus panels)
2. Grid calculations must be resolution-independent
3. Use window's current monitor for positioning
4. Account for GNOME panel/dock when calculating workarea

## Success Criteria

- [ ] All gTile positions available via wctl tile
- [ ] Center command works in all three modes
- [ ] Works on any resolution
- [ ] Works correctly with panels/docks
- [ ] Multi-monitor aware (uses correct monitor)
