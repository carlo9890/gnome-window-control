---
id: gnomewindo-9ewf2a
title: wctl CLI Wrapper Script
status: closed
type: epic
priority: 2
creator: hans
labels:
  - beads:stop-gap-5bn
blocked_by:
  - gnomewindo-sbkbxf
  - gnomewindo-5hlnx3
created: 2026-01-08T12:14:36Z
updated: 2026-01-08T12:30:01Z
closed: 2026-01-08T13:30:01Z
close_reason: All tasks completed and acceptance gate passed
---

## Description
A user-friendly CLI wrapper (`wctl`) around the GNOME Window Control extension's D-Bus interface. Makes window control ergonomic from the command line.

## Goals
- Provide intuitive CLI for all extension D-Bus methods
- Output formatted tables for human reading
- Support JSON output for scripting
- Single script, no dependencies beyond bash and standard tools

## Example Usage
```bash
wctl list                    # List windows (formatted table)
wctl list --json             # JSON output
wctl focused                 # Show focused window info
wctl activate 12345          # Activate by ID
wctl activate -t "Firefox"   # Activate by title
wctl activate -c kitty       # Activate by WM class
wctl move 12345 100 100      # Move window
wctl resize 12345 1920 1080  # Resize window
wctl maximize 12345          # Maximize
wctl close 12345             # Close window (polite)
```

## Success Criteria
- [ ] All extension methods accessible via wctl
- [ ] Human-readable and JSON output modes
- [ ] Help text for all commands
- [ ] Works with bash completion (future nice-to-have)

## Dependencies
- Requires core extension epic to be complete
