---
id: gnomewindo-8hy5yr
title: 'Bug: wctl list table format fails with awk syntax error'
status: closed
type: bug
priority: 2
creator: hans
labels:
  - beads:stop-gap-thy
created: 2026-01-08T16:34:05Z
updated: 2026-01-08T16:42:22Z
closed: 2026-01-08T17:42:22Z
close_reason: 'Fixed both bugs: removed uint64: prefix from GetGeometry call, rewrote awk to be POSIX-compatible'
---

## Description
The `wctl list` command (table format) fails with awk syntax errors when parsing window data.

## Error Output
```
awk: line 15: syntax error at or near ,
awk: line 21: syntax error at or near ,
awk: line 30: syntax error at or near ,
...
```

## Root Cause
The awk script in `cmd_list()` uses gawk-specific features (like named capture groups with `match()`) that aren't compatible with mawk (the default awk on many systems).

## Workaround
Use `wctl list --json` instead, which works correctly.

## Fix Options
1. Rewrite the awk parsing to be POSIX-compatible
2. Use a different parsing approach (bash, jq, etc.)
3. Require gawk explicitly

## Note
Pre-existing issue found while implementing wctl tests.
