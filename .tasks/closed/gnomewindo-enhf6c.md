---
id: gnomewindo-enhf6c
title: Remove MoveToMonitor/MoveToWorkspace, add validation to Move/Resize
status: closed
type: bug
priority: 0
creator: hans
labels:
  - beads:stop-gap-5al
created: 2026-01-08T16:11:01Z
updated: 2026-01-08T16:14:29Z
closed: 2026-01-08T17:14:29Z
close_reason: Removed MoveToMonitor/MoveToWorkspace methods from D-Bus interface XML and implementation. Added validation to Move (finite coordinates), Resize (positive finite dimensions), and MoveResize (all parameters). Updated debug-dbus.sh to remove test sections for removed methods.
---

## Description

**CRITICAL BUG**: The `MoveToMonitor` method crashes GNOME Shell/Mutter when called with an invalid monitor index. This kills the entire user session.

Confirmed crash sequence from `output/debug-20260108-170730.txt`:
```
=== MoveToMonitor 2266769591 99 (invalid monitor - error expected) ===
Error: GDBus.Error:org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying
```

## Resolution

**Remove the dangerous APIs entirely** rather than trying to make them safe:
- `MoveToMonitor` - REMOVE
- `MoveToWorkspace` - REMOVE

**Keep but add validation**:
- `Move(windowId, x, y)` - add bounds checking
- `Resize(windowId, width, height)` - add dimension validation
- `MoveResize(windowId, x, y, width, height)` - add both

## Instructions

### 1. Remove MoveToMonitor and MoveToWorkspace

From the D-Bus interface XML (around line 166-185), remove:
```xml
<method name="MoveToMonitor">
  <arg type="t" direction="in" name="windowId"/>
  <arg type="i" direction="in" name="monitor"/>
  <arg type="b" direction="out" name="success"/>
</method>
<method name="MoveToWorkspace">
  <arg type="t" direction="in" name="windowId"/>
  <arg type="i" direction="in" name="workspace"/>
  <arg type="b" direction="out" name="success"/>
</method>
```

Remove the method implementations (around lines 638-672):
- `MoveToMonitor(windowId, monitor)` 
- `MoveToWorkspace(windowId, workspace)`

### 2. Add validation to Move/Resize/MoveResize

For `Move(windowId, x, y)`:
```javascript
Move(windowId, x, y) {
    console.error(`[Window Control] Move(${windowId}, ${x}, ${y}) called`);
    try {
        // Validate coordinates are reasonable numbers
        if (typeof x !== 'number' || typeof y !== 'number' ||
            !Number.isFinite(x) || !Number.isFinite(y)) {
            console.error(`[Window Control] Move: Invalid coordinates`);
            return false;
        }
        
        const win = this._findWindowById(windowId);
        if (win) {
            win.move_frame(true, x, y);
            console.error(`[Window Control] Move(${windowId}, ${x}, ${y}) -> true`);
            return true;
        }
        console.error(`[Window Control] Move(${windowId}) -> false (window not found)`);
        return false;
    } catch (e) {
        console.error(`[Window Control] Move() error: ${e.message}`);
        return false;
    }
}
```

For `Resize(windowId, width, height)`:
```javascript
Resize(windowId, width, height) {
    console.error(`[Window Control] Resize(${windowId}, ${width}, ${height}) called`);
    try {
        // Validate dimensions are positive finite numbers
        if (typeof width !== 'number' || typeof height !== 'number' ||
            !Number.isFinite(width) || !Number.isFinite(height) ||
            width <= 0 || height <= 0) {
            console.error(`[Window Control] Resize: Invalid dimensions (must be positive)`);
            return false;
        }
        
        const win = this._findWindowById(windowId);
        if (win) {
            const rect = win.get_frame_rect();
            win.move_resize_frame(true, rect.x, rect.y, width, height);
            console.error(`[Window Control] Resize(${windowId}, ${width}, ${height}) -> true`);
            return true;
        }
        console.error(`[Window Control] Resize(${windowId}) -> false (window not found)`);
        return false;
    } catch (e) {
        console.error(`[Window Control] Resize() error: ${e.message}`);
        return false;
    }
}
```

For `MoveResize(windowId, x, y, width, height)`:
```javascript
MoveResize(windowId, x, y, width, height) {
    console.error(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) called`);
    try {
        // Validate all parameters
        if (typeof x !== 'number' || typeof y !== 'number' ||
            typeof width !== 'number' || typeof height !== 'number' ||
            !Number.isFinite(x) || !Number.isFinite(y) ||
            !Number.isFinite(width) || !Number.isFinite(height) ||
            width <= 0 || height <= 0) {
            console.error(`[Window Control] MoveResize: Invalid parameters`);
            return false;
        }
        
        const win = this._findWindowById(windowId);
        if (win) {
            win.move_resize_frame(true, x, y, width, height);
            console.error(`[Window Control] MoveResize(${windowId}, ${x}, ${y}, ${width}, ${height}) -> true`);
            return true;
        }
        console.error(`[Window Control] MoveResize(${windowId}) -> false (window not found)`);
        return false;
    } catch (e) {
        console.error(`[Window Control] MoveResize() error: ${e.message}`);
        return false;
    }
}
```

### 3. Update debug-dbus.sh

Remove the test sections for:
- `MoveToMonitor`
- `MoveToWorkspace`

### 4. Test in Nested Session

```bash
./scripts/update.sh install
./scripts/update.sh nested

# In nested session:
gnome-extensions enable window-control@hko9890

# Test that removed methods return errors:
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.MoveToMonitor 12345 0
# Should fail with "no such method"

# Test Move/Resize with bad values:
gdbus call --session --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.Resize 12345 0 0
# Should return (false,) not crash

# Run full test suite:
./scripts/debug-dbus.sh
# Should complete without crashing
```

## Acceptance Criteria

- [ ] MoveToMonitor removed from D-Bus interface and implementation
- [ ] MoveToWorkspace removed from D-Bus interface and implementation  
- [ ] Move validates coordinates are finite numbers
- [ ] Resize validates dimensions are positive finite numbers
- [ ] MoveResize validates all parameters
- [ ] debug-dbus.sh updated to remove MoveToMonitor/MoveToWorkspace tests
- [ ] Full debug-dbus.sh completes without crashing nested session
