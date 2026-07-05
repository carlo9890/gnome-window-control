---
id: gnomewindo-lpvrfj
title: Fix syntax error in extension.js (missing closing brace)
status: closed
type: bug
priority: 0
assignee: hans.kohlreiter@dynatrace.com
creator: Hans Kohlreiter
labels:
  - beads:stop-za6
created: 2026-01-18T16:18:17Z
updated: 2026-01-18T16:24:34Z
closed: 2026-01-18T17:24:34Z
close_reason: 'False alarm - syntax is actually correct. The error was from a stale GNOME Shell session. Reinstalled extension with ./scripts/build.sh install. User needs to restart GNOME Shell to load clean version. Root cause: lack of syntax validation in workflow - created stop-seq to fix process.'
---

## Description

Syntax error in extension.js line 433 - missing closing brace for ListDetailed() method.

## Error Message
```
SyntaxError: unexpected token: '{' @ extension.js:433:19
```

## Root Cause

Line 430 has the closing brace for the try-catch block, but ListDetailed() method itself is not closed before the ListMonitors() comment starts on line 432.

## Fix Required

Add closing brace `}` after line 430, before the ListMonitors comment.

## Files to Modify
- window-control@hko9890/extension.js - add missing `}` after line 430
