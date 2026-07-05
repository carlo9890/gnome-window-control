---
id: gnomewindo-xzm6n6
title: Add tests for tile and center commands
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-6aa
blocked_by:
  - gnomewindo-jmixr0
  - gnomewindo-b6yhi8
created: 2026-01-09T19:30:52Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T16:48:28Z
close_reason: Implemented comprehensive test script scripts/test-tile-center.sh with 24 tests covering all 9 tile positions, 6 center modes, and 9 error cases. Includes geometry verification, clear pass/fail output, and prerequisite checking. Also created README with setup instructions and troubleshooting guide.
---

## Description

Create tests for the new `wctl tile` and `wctl center` commands to ensure they work correctly across different scenarios.

## Instructions

1. Create test script `scripts/test-tile-center.sh`
2. Test all tile positions
3. Test all center modes
4. Test edge cases and error handling
5. Verify calculations are correct for the current monitor

## Test Cases

### Tile Command Tests

```bash
# Valid positions - should all succeed
wctl tile $ID top-left
wctl tile $ID top-center
wctl tile $ID top-right
wctl tile $ID left
wctl tile $ID center
wctl tile $ID right
wctl tile $ID bottom-left
wctl tile $ID bottom-center
wctl tile $ID bottom-right

# Error cases
wctl tile                      # missing args - should error
wctl tile $ID                  # missing position - should error
wctl tile $ID invalid-pos      # invalid position - should error
wctl tile 99999999 center      # invalid window ID - should error
```

### Center Command Tests

```bash
# Valid modes
wctl center $ID                # default (both)
wctl center $ID both
wctl center $ID horizontal
wctl center $ID vertical

# Short forms (if implemented)
wctl center $ID h
wctl center $ID v

# Error cases
wctl center                    # missing window ID - should error
wctl center $ID invalid        # invalid mode - should error
wctl center 99999999           # invalid window ID - should error
```

### Geometry Verification Tests

```bash
# After tiling, verify the window is in the expected position
# Get workarea
read wa_x wa_y wa_w wa_h <<< $(get_workarea)
cell_w=$((wa_w / 4))
cell_h=$((wa_h / 2))

# Tile top-left and verify
wctl tile $ID top-left
geom=$(wctl info $ID --json | jq '.frame_rect')
# Assert: x == wa_x, y == wa_y, width == cell_w, height == cell_h

# Tile center and verify
wctl tile $ID center
# Assert: x == wa_x + cell_w, width == cell_w * 2, height == wa_h
```

### Multi-Monitor Tests (if applicable)

```bash
# Move window to different monitor, tile should use that monitor's workarea
# (manual test or skip if single monitor)
```

## Files to Create

- `scripts/test-tile-center.sh` - comprehensive test script

## Acceptance Criteria

- [ ] All 9 tile positions tested
- [ ] All 3 center modes tested
- [ ] Error cases return non-zero exit code
- [ ] Geometry verification confirms correct positioning
- [ ] Tests can be run via `./scripts/test-tile-center.sh`
- [ ] Tests output clear pass/fail status

## Dependencies

Depends on: tile and center commands being implemented first
