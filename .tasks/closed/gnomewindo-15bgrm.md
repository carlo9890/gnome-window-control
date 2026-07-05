---
id: gnomewindo-15bgrm
title: 'Fix debug script: remove gdbus type prefixes'
status: closed
type: bug
priority: 1
creator: hans
labels:
  - beads:stop-gap-3k3
created: 2026-01-08T15:31:05Z
updated: 2026-01-08T15:31:54Z
closed: 2026-01-08T16:31:54Z
close_reason: 'Removed all uint64: and int32: type prefixes from gdbus call parameters in scripts/debug-dbus.sh. Verified no type prefixes remain and script syntax is valid.'
---

## Description

The debug script `scripts/debug-dbus.sh` uses incorrect `gdbus call` parameter syntax, causing all methods that take window ID parameters to fail.

## Root Cause

The script uses GVariant-style type prefixes like `uint64:$WINDOW_ID` and `int32:100`, but `gdbus call` expects bare values and infers types from the D-Bus interface definition.

**Wrong syntax:**
```bash
gdbus call ... --method "$IFACE.Activate" "uint64:$WINDOW_ID"
gdbus call ... --method "$IFACE.Move" "uint64:$WINDOW_ID" "int32:100" "int32:100"
```

**Correct syntax:**
```bash
gdbus call ... --method "$IFACE.Activate" "$WINDOW_ID"
gdbus call ... --method "$IFACE.Move" "$WINDOW_ID" 100 100
```

## Evidence

From debug output, all parameterized methods fail with:
```
Error parsing parameter 1 of type "t": expected value:
  uint64:2188840987
        ^          
```

While methods without parameters (List, ListDetailed, GetFocused) work fine.

## Instructions

1. Open `scripts/debug-dbus.sh`
2. Remove all `uint64:` prefixes from window ID parameters
3. Remove all `int32:` prefixes from x, y, width, height parameters
4. Keep boolean values as `true`/`false` (these work correctly)

## Files to Modify

- `scripts/debug-dbus.sh` - Remove type prefixes from gdbus call parameters

## Acceptance Criteria

- [ ] All gdbus calls use bare values without type prefixes
- [ ] Running `./scripts/debug-dbus.sh` produces successful output for all methods
- [ ] No "Error parsing parameter" errors in output
