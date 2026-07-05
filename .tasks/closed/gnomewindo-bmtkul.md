---
id: gnomewindo-bmtkul
title: Add syntax validation requirement to AGENTS.md
status: closed
type: task
priority: 1
assignee: hans.kohlreiter@dynatrace.com
creator: Hans Kohlreiter
labels:
  - beads:stop-seq
created: 2026-01-18T16:24:29Z
updated: 2026-01-18T18:28:37Z
closed: 2026-01-18T19:28:37Z
close_reason: Added JavaScript syntax validation section to AGENTS.md after line 137
---

## Description

Add a critical section to AGENTS.md documenting the **mandatory syntax validation requirement** for all JavaScript code changes.

## Context

A syntax error in extension.js was committed and closed without validation, causing the extension to fail to load. This violated basic code quality standards.

## Instructions

Add a new section after "### Logging" (line 125) and before "### Common Issues" (line 139):

```markdown
### JavaScript Syntax Validation

**CRITICAL**: When modifying JavaScript files (extension.js, etc.), you MUST validate syntax before closing any task.

#### Required Validation Steps

1. **Node.js syntax check** (minimum requirement):
   ```bash
   node --check window-control@hko9890/extension.js
   ```
   If this fails, the code has syntax errors and cannot be committed.

2. **Install and verify extension loads** (required for extension.js changes):
   ```bash
   ./scripts/build.sh install
   
   # After GNOME Shell restart:
   gnome-extensions info window-control@hko9890 | grep "State"
   ```
   
   If State shows "ERROR", check logs:
   ```bash
   journalctl --user -b -g "window-control@hko9890" --since "5 minutes ago"
   ```

3. **Verify D-Bus interface available** (if D-Bus methods were added/modified):
   ```bash
   gdbus introspect --session \
     --dest org.gnome.Shell \
     --object-path /org/gnome/Shell/Extensions/WindowControl
   ```

#### Task Acceptance Criteria Template

All tasks that modify JavaScript code MUST include these acceptance criteria:

```markdown
## Acceptance Criteria
- [ ] Code passes syntax check (`node --check <file>`)
- [ ] Extension loads without errors (State: ENABLED)
- [ ] No JavaScript errors in logs
- [ ] [functional requirements...]
```

**Never close a task without validating syntax.**
```

## Files to Modify

- AGENTS.md - insert new section between lines 137-139

## Acceptance Criteria

- [ ] Code passes syntax check (`node --check AGENTS.md`)
- [ ] New section is properly formatted markdown
- [ ] Section is placed between "Logging" and "Common Issues"
- [ ] Template includes all three validation steps
- [ ] Clear that syntax validation is mandatory, not optional

## Priority

P1 - This is a critical process improvement to prevent broken code from being committed.
