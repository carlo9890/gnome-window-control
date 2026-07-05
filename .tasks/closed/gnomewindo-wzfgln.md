---
id: gnomewindo-wzfgln
title: Implement MoveToMonitor and MoveToWorkspace D-Bus methods
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-r97
created: 2026-01-08T16:22:47Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T17:23:57Z
close_reason: 'Decision: Not implementing MoveToMonitor and MoveToWorkspace - out of scope'
---

## Description

The requirements document specifies `MoveToMonitor` and `MoveToWorkspace` methods, but they are not implemented in the extension.

## From Requirements Doc

```markdown
#### `MoveToMonitor(id: t, monitor: i) → b`

Move window to specified monitor index.

#### `MoveToWorkspace(id: t, workspace: i) → b`

Move window to specified workspace index.
```

## Implementation Needed

Add to extension.js:

1. D-Bus interface XML for both methods
2. `MoveToMonitor(windowId, monitor)` method using `win.move_to_monitor(monitor)`
3. `MoveToWorkspace(windowId, workspace)` method using `win.change_workspace_by_index(workspace)`

## Acceptance Criteria

- [ ] MoveToMonitor method implemented with D-Bus interface
- [ ] MoveToWorkspace method implemented with D-Bus interface
- [ ] Both methods have verbose logging like other methods
- [ ] Both methods handle window not found case

## Context

Found during verification of gate stop-gap-83a (Epic Acceptance: D-Bus Testing Complete).
