---
id: gnomewindo-tc1fl5
title: 'Fix extension crash: appears_focused property error'
status: closed
type: bug
priority: 0
creator: hans
labels:
  - beads:stop-gap-8ao
created: 2026-01-08T15:15:26Z
updated: 2026-01-08T15:15:44Z
closed: 2026-01-08T16:15:44Z
close_reason: 'Fixed line 411: changed ''win.appears_focused'' to ''typeof win.appears_focused === "boolean" ? win.appears_focused : win.has_focus()'' to safely handle when the property doesn''t exist'
---

## Description
The extension crashes with `win.appears_focused is not a function` error, causing ListDetailed() to return empty results.

## Error
```
[Window Control] ListDetailed() error: win.appears_focused is not a function
```

## Cause
Line 411 in extension.js:
```javascript
appears_focused: win.appears_focused,
```

The `appears_focused` property may not exist or work differently in GNOME 46.

## Fix
Wrap in try/catch or check if property exists:
```javascript
appears_focused: win.appears_focused ?? win.has_focus(),
```

## Acceptance Criteria
- [ ] ListDetailed() returns window data without errors
- [ ] Extension works in GNOME 46
