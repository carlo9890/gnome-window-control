---
id: gnomewindo-p1kr02
title: Add shell completion for wctl CLI
status: closed
type: task
priority: 2
creator: hans
labels:
  - beads:stop-gap-8kz
created: 2026-01-10T22:32:30Z
updated: 2026-01-10T22:34:08Z
closed: 2026-01-10T23:34:08Z
close_reason: 'Implemented shell completion for wctl CLI: added bash and zsh completion scripts embedded in wctl (via heredocs), added ''completion'' subcommand that outputs appropriate script for bash or zsh, updated help with installation instructions'
---

Implement bash and zsh completion scripts for the wctl command. The completions should support:

## Commands to complete
- list, focused, info, activate, focus
- move, resize, move-resize
- minimize, unminimize, maximize, unmaximize, fullscreen, unfullscreen
- above, sticky, close, help

## Command-specific completions
- list: --json option
- focused: --json option
- info: --json option, window IDs
- activate: -t, -s, -c, -p options, window IDs
- focus: window IDs
- move/resize/move-resize: window IDs
- State commands (minimize, maximize, etc.): window IDs
- above/sticky: window IDs, then on|off

## Dynamic completions
- Window IDs should be dynamically completed by querying wctl list --json
- Show window title as description when completing IDs (if shell supports it)

## Files to create
- completions/wctl.bash - Bash completion script
- completions/wctl.zsh - Zsh completion script

## Integration
- Add 'completion' subcommand to wctl that outputs the appropriate completion script
- Usage: wctl completion bash > ~/.local/share/bash-completion/completions/wctl
- Usage: wctl completion zsh > ~/.local/share/zsh/site-functions/_wctl
