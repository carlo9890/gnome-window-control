---
id: gnomewindo-gerw1i
title: Document release process in AGENTS.md
status: closed
type: task
priority: 1
assignee: hans.kohlreiter@dynatrace.com
creator: Hans Kohlreiter
labels:
  - beads:stop-wmh
created: 2026-01-18T18:42:08Z
updated: 2026-01-18T18:42:26Z
closed: 2026-01-18T19:42:26Z
close_reason: Added Release Process section to AGENTS.md before Requirements Doc section
---

## Description

Add a "Release Process" section to AGENTS.md documenting that releases MUST be created using `./scripts/release.sh`, not manually.

## Context

v5 release was created manually with `gh release create` which resulted in missing assets (wctl and install-wctl.sh). The project has a release script with safeguards, but it wasn't used because the process wasn't documented in AGENTS.md.

## Instructions

Add a new section before "## Requirements Doc" (currently last section):

```markdown
## Release Process

**CRITICAL**: All releases MUST be created using the release script.

```bash
./scripts/release.sh
```

**Never create releases manually** with `gh release create` or the GitHub web UI. The script ensures:
- All 3 required assets are included (extension zip, wctl, install-wctl.sh)
- Version numbers match between metadata.json and wctl
- Git tags exist and are pushed
- Release notes are properly formatted

See CONTRIBUTING.md for full release checklist.
```

## Files to Modify

- AGENTS.md - add new section before "## Requirements Doc"

## Acceptance Criteria

- [ ] New section added to AGENTS.md
- [ ] Section clearly states releases MUST use the script
- [ ] Mentions all 3 required assets
- [ ] References CONTRIBUTING.md for details
- [ ] Properly formatted markdown
