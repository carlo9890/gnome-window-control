---
id: gnomewindo-u4v6ey
title: Create extension scaffolding and metadata
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-pjj
created: 2026-01-08T12:14:53Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T13:17:29Z
close_reason: 'Created extension scaffolding: metadata.json with GNOME 45-47 support, extension.js with Extension class (ESM format), and README.md with installation instructions'
---

## Description
Set up the basic GNOME Shell extension structure with proper metadata for GNOME 45-47 compatibility.

## Instructions
1. Create extension directory: `window-control@local/`
2. Create `metadata.json` with:
   - uuid: "window-control@local"
   - name: "Window Control"
   - description: "D-Bus interface for listing and controlling windows"
   - shell-version: ["45", "46", "47"]
   - version: 1
3. Create empty `extension.js` with basic enable/disable structure
4. Add a README.md with installation instructions

## Files to Create
- `window-control@local/metadata.json`
- `window-control@local/extension.js` (scaffold only)
- `window-control@local/README.md`

## Acceptance Criteria
- [ ] Valid metadata.json with correct shell-version array
- [ ] Extension.js has Extension class with enable() and disable() methods
- [ ] Extension can be installed with `gnome-extensions install`

## Notes
- Use ESM module format (GNOME 45+ standard)
- Reference: https://gjs.guide/extensions/development/creating.html
