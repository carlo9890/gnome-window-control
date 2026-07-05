---
id: gnomewindo-8tg5ya
title: Centralize version management for releases
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-aep
created: 2026-01-11T10:55:59Z
updated: 2026-01-11T10:57:51Z
closed: 2026-01-11T11:57:51Z
close_reason: Added check_wctl_version() function that validates wctl VERSION matches 0.<metadata_version>.0 format. Updated usage() docs with step 1b for updating wctl VERSION.
---

## Problem
Currently versions are defined in multiple places with no validation:
- `window-control@hko9890/metadata.json` - version: 4 (integer, GNOME requirement)
- `wctl` - VERSION="0.4.0" (hardcoded string)
- Git tags - v4

This creates risk of version mismatch on release.

## Proposed Solution

### Option A: Single source of truth in metadata.json
- Keep version in metadata.json (required by GNOME)
- wctl reads version dynamically OR release script updates wctl
- Pros: Simple, one file to update
- Cons: Need to decide on format (0.4.0 vs 4)

### Option B: Dedicated VERSION file
- Create VERSION file with canonical version (e.g., "0.4.0")
- build.sh extracts major version for metadata.json
- release.sh updates wctl
- Pros: Flexible format, clear source
- Cons: Another file to maintain

### Recommendation: Option A with validation
1. Use metadata.json as source of truth
2. Format: Use integer (4) - GNOME requires it
3. wctl shows "0.<version>.0" format (e.g., "0.4.0")
4. release.sh validates wctl version matches before release

## Implementation
1. Modify wctl to derive version from metadata.json at runtime OR
2. Add version validation to release.sh that fails if mismatch
3. Add helper script/function to update wctl version during release

## Open Questions
- [ ] Should wctl read version dynamically (requires metadata.json at runtime)?
- [ ] Or should release script update wctl VERSION before release?
- [ ] Version format: "4" vs "0.4.0" vs "v4"?
