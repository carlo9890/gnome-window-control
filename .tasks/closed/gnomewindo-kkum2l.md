---
id: gnomewindo-kkum2l
title: Add wctl/D-Bus parity check to build process
status: closed
type: chore
priority: 3
creator: hans
labels:
  - beads:stop-gap-tvj
blocked_by:
  - gnomewindo-juxiik
created: 2026-01-09T15:28:17Z
updated: 2026-01-18T15:43:55Z
closed: 2026-01-18T12:31:47Z
---

## Description

The bug stop-gap-h6g revealed that `wctl` can have commands that call D-Bus methods which don't exist in the extension. This should be caught during development/build.

## Proposal

Add a validation step to `scripts/build.sh` that:

1. Extracts all `dbus_call "MethodName"` calls from `wctl`
2. Extracts all `<method name="...">` from `extension.js` D-Bus interface XML
3. Compares the two lists
4. Fails the build if wctl calls methods not in the interface

## Example Implementation

```bash
# Extract methods called by wctl
wctl_methods=$(grep -oP 'dbus_call "\K[^"]+' wctl | sort -u)

# Extract methods defined in extension
dbus_methods=$(grep -oP '<method name="\K[^"]+' window-control@hko9890/extension.js | sort -u)

# Find methods in wctl but not in dbus
missing=$(comm -23 <(echo "$wctl_methods") <(echo "$dbus_methods"))
if [[ -n "$missing" ]]; then
    echo "ERROR: wctl calls D-Bus methods not defined in extension:"
    echo "$missing"
    exit 1
fi
```

## Acceptance Criteria

- [ ] `./scripts/build.sh validate` checks wctl/D-Bus parity
- [ ] Build fails if mismatch detected
- [ ] Clear error message shows which methods are missing

## Dependencies

- Depends on: stop-gap-h6g (fix the immediate bug first)
