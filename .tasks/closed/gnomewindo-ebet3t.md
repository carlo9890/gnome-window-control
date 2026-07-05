---
id: gnomewindo-ebet3t
title: Fix List() returning empty array
status: closed
type: bug
priority: 0
creator: hans
labels:
  - beads:stop-gap-728
created: 2026-01-08T15:19:37Z
updated: 2026-01-08T15:20:02Z
closed: 2026-01-08T16:20:02Z
close_reason: 'Fixed List() double-wrapping bug: pass raw win.get_id() to Variant constructor instead of pre-wrapped GLib.Variant'
---

## Description
`List()` method returns empty array while `ListDetailed()` works correctly.

## Evidence
```
=== List ===
(@a(tssssbiiii) [],)

=== ListDetailed ===
('[{"id":309771848,"title":"...","wm_class":"kitty",...}]',)
```

## Probable Cause
Line 366-369 in extension.js creates a GLib.Variant for windowId, then wraps it in another Variant:
```javascript
const windowId = new GLib.Variant('t', win.get_id());
result.push(new GLib.Variant('(tssssbiiii)', [
    windowId,  // Already a Variant - double wrapping?
```

The nested Variant might cause a silent failure caught by try/catch.

## Fix
Pass the raw value instead of pre-wrapping:
```javascript
result.push(new GLib.Variant('(tssssbiiii)', [
    win.get_id(),  // Pass raw value, let Variant constructor handle it
    ...
```
