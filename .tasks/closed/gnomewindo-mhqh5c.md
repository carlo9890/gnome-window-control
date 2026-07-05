---
id: gnomewindo-mhqh5c
title: Update GitHub Actions for 3 artifacts
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-373
blocked_by:
  - gnomewindo-lj3si0
created: 2026-01-08T17:28:10Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:32:28Z
close_reason: 'Updated GitHub Actions workflow to publish 3 artifacts: extension zip, wctl, and install-wctl.sh. Updated release notes to include installation instructions for all artifacts'
---

## Description
Update the GitHub Actions workflow to publish 3 separate artifacts: extension zip, wctl script, and install script.

## Instructions
1. Find and read the existing GitHub Actions workflow
2. Update to publish 3 artifacts:
   - `window-control-extension.zip` - the extension zip file
   - `wctl` - the CLI wrapper script
   - `install-wctl.sh` - the install script

3. Artifacts should be uploaded on:
   - Release creation
   - Or manual workflow dispatch

## Files to Modify
- .github/workflows/*.yml (find the build/release workflow)

## Acceptance Criteria
- [ ] Workflow publishes extension zip
- [ ] Workflow publishes wctl script
- [ ] Workflow publishes install-wctl.sh
- [ ] All 3 artifacts available in release
