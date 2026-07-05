---
id: gnomewindo-9jhz3k
title: Add ListMonitors D-Bus method to extension
status: closed
type: task
priority: 2
assignee: hans.kohlreiter@dynatrace.com
creator: Hans Kohlreiter
labels:
  - beads:stop-gap-btf
created: 2026-01-18T14:31:34Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-18T15:35:17Z
close_reason: Closed
---

## Description

Add a D-Bus method to list all monitors with their properties. This allows clients to discover available monitors and their geometry before calling GetWorkarea or positioning windows.

## Rationale

Currently, clients calling `GetWorkarea(monitor_index)` have no way to discover:
- How many monitors exist
- Which monitor indices are valid (0 to n-1)
- Monitor geometry (full screen size vs workarea)
- Which monitor is primary
- Monitor names/connectors

Windows include `monitor_index` in their info, but this only works if a window already exists on that monitor.

## Proposed Method

```javascript
<!--
  ListMonitors: Get all monitors with their properties
  Returns: s - JSON array of monitor objects
-->
<method name="ListMonitors">
  <arg type="s" direction="out" name="monitors_json"/>
</method>
```

## JSON Output Format

```json
[
  {
    "index": 0,
    "x": 0,
    "y": 0,
    "width": 1920,
    "height": 1080,
    "is_primary": true,
    "connector": "HDMI-1",
    "scale": 1.0
  },
  {
    "index": 1,
    "x": 1920,
    "y": 0,
    "width": 1920,
    "height": 1080,
    "is_primary": false,
    "connector": "DP-1",
    "scale": 1.0
  }
]
```

## Implementation Notes

Use GNOME Shell APIs:
- `global.display.get_n_monitors()` - get count
- `global.display.get_monitor_geometry(i)` - get full geometry (Meta.Rectangle)
- `global.display.get_primary_monitor()` - get primary monitor index
- `global.display.get_monitor_scale(i)` - get scale factor
- For connector name, may need to access `global.backend.get_monitor_manager()` or return empty string

## Files to Modify

- `window-control@hko9890/extension.js` - Add D-Bus method definition and implementation

## Acceptance Criteria

- [ ] ListMonitors returns JSON array of all monitors
- [ ] Each monitor object includes: index, x, y, width, height, is_primary
- [ ] Monitor indices are sequential from 0 to n-1
- [ ] Works correctly with 1, 2, or more monitors
- [ ] Returns empty array `[]` if no monitors (edge case)
- [ ] JSON is valid and parseable

## Usage Example

```bash
# List all monitors
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/gnome/Shell/Extensions/WindowControl \
  --method org.gnome.Shell.Extensions.WindowControl.ListMonitors

# With wctl (future enhancement)
wctl monitors --json
```

## Follow-up Work

After this is implemented, we can:
- Add `wctl monitors` command to list monitors in table format
- Add `--monitor` flag to `wctl tile` and `wctl center` commands
- Use monitor info to validate monitor_index in GetWorkarea calls
