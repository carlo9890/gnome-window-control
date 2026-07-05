---
id: gnomewindo-lj3si0
title: Create wctl install script
status: closed
type: task
priority: 1
creator: hans
labels:
  - beads:stop-gap-cs9
created: 2026-01-08T17:28:02Z
updated: 2026-06-20T13:50:40Z
closed: 2026-01-08T18:31:54Z
close_reason: Created install-wctl.sh script that copies wctl to ~/.local/bin, makes it executable, and warns if PATH doesn't include ~/.local/bin. Also added extension install/enable checks to wctl with clear error messages
---

## Description
Create an install script for wctl that copies it to ~/.local/bin and validates the extension.

## Instructions
1. Create `install-wctl.sh` in project root

2. Script should:
   - Check if ~/.local/bin exists, create if not
   - Copy wctl to ~/.local/bin/wctl
   - Make it executable (chmod +x)
   - Check if ~/.local/bin is in PATH, warn if not
   - Print success message

3. Update wctl script to check extension status:
   - On any command (except help), check if extension is installed
   - Check if extension is enabled
   - Provide clear error messages with instructions

## Extension Checks in wctl
```bash
# Check if extension is installed
if ! gnome-extensions list | grep -q "window-control@hko9890"; then
    die "Window Control extension is not installed.
    
Install it with:
    gnome-extensions install window-control@hko9890
    
Or copy manually:
    cp -r window-control@hko9890 ~/.local/share/gnome-shell/extensions/
    
Then restart GNOME Shell and enable the extension."
fi

# Check if extension is enabled
if ! gnome-extensions list --enabled | grep -q "window-control@hko9890"; then
    die "Window Control extension is installed but not enabled.
    
Enable it with:
    gnome-extensions enable window-control@hko9890"
fi
```

## Files to Create
- install-wctl.sh

## Files to Modify
- wctl (add extension checks)

## Acceptance Criteria
- [ ] install-wctl.sh is executable
- [ ] Script copies wctl to ~/.local/bin
- [ ] Script checks PATH
- [ ] wctl checks if extension is installed
- [ ] wctl checks if extension is enabled
- [ ] Clear error messages with instructions
