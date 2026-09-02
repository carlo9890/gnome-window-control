---
id: gnomewindo-8thy5l
title: Verify the Rust wctl in a live session and record timings
status: open
type: task
priority: 2
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-unqjxk
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

The crate slices were verified against the live suites, mostly in nested
GNOME Shell sessions (`docs/RUNNING.md` lists the pitfalls: shared dconf,
startup overview, slow clients under software rendering). The epic's success
criteria ask for a live, non-nested session and for timings against the
2026-09-02 baseline: `wctl list` 9 ms, `info` 9 ms, `focused` 14 ms, `tile`
16 ms, raw `gdbus call` 3 ms. The live session must run the extension build
with the workspace, monitor and wait methods under UUID
`window-control@carlo9890.github.io` (see issue gnomewindo-vx3u87 for the UUID
switch).

## Problem

Nested sessions differ from the desktop (software rendering, no input
timestamps, overview at start), so the suites passing there is not the
evidence the epic promises. This task ends with a recorded result, not with a
code change; anything it finds is filed separately.

## Recommended action

With the binary installed by `./install-wctl.sh --local` and the extension
enabled in the live session:

1. `./tests/run-all-query-tests.sh` and `./tests/run-all-modification-tests.sh`;
   keep the full output.
2. Time 10 runs each of `wctl list`, `wctl info <id>`, `wctl focused`,
   `wctl tile <id> left` (restore the window afterwards) with `date +%s%N`
   around each run; take the median.
3. `PATH=$(dirname "$(command -v wctl)") wctl list` to prove no runtime
   dependency on jq, busctl or gdbus.

## Acceptance criteria

- [ ] A comment on the epic holds both runner summaries and a table of the four medians next to the baseline numbers
- [ ] If any assertion fails, a bug is filed with the failing output pasted and linked to the epic, and this task stays open until it is resolved
- [ ] The epic's success criteria that this task covers are ticked by the person closing it, with this task's comment as the evidence
