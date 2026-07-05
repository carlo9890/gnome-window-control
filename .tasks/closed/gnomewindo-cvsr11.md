---
id: gnomewindo-cvsr11
title: 'Epic Acceptance: Window Tiling & Centering'
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-3vh
blocked_by:
  - gnomewindo-b6yhi8
  - gnomewindo-jmixr0
  - gnomewindo-elrk0v
  - gnomewindo-xzm6n6
created: 2026-01-09T19:30:18Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T17:35:48Z
close_reason: |-
  All acceptance criteria verified:
  - All tasks closed ✓
  - All 9 tile positions tested and working ✓
  - All 3 center modes tested and working ✓
  - Resolution-independent (tested on 5120x1440) ✓
  - Respects panels/docks (32px offset confirmed) ✓
  - Help text updated ✓
  - Manual testing completed ✓
  - Extension State: ACTIVE
  - Release v5 published
---

## Gate Criteria

- [ ] All tasks in epic are closed
- [ ] `wctl tile` works with all 9 positions
- [ ] `wctl center` works with all 3 modes (horizontal, vertical, both)
- [ ] Commands work on any resolution
- [ ] Commands respect panels/docks (use workarea)
- [ ] Help text is updated for both commands
- [ ] Manual testing completed on user's ultrawide setup

## Test Commands

```bash
# Get a window ID
ID=$(wctl focused --json | jq -r '.id')

# Test all tile positions
wctl tile $ID top-left
wctl tile $ID top-center
wctl tile $ID top-right
wctl tile $ID left
wctl tile $ID center
wctl tile $ID right
wctl tile $ID bottom-left
wctl tile $ID bottom-center
wctl tile $ID bottom-right

# Test center modes
wctl center $ID
wctl center $ID horizontal
wctl center $ID vertical
```

## Owner

beads-verify-agent
