---
id: gnomewindo-7unlkx
title: 'Spike: measure a zbus blocking client against the extension'
status: open
type: task
priority: 1
creator: hans
parent: gnomewindo-ypokef
blocked_by:
  - gnomewindo-w79bff
created: 2026-09-02T08:07:45Z
updated: 2026-09-02T08:07:45Z
---

## Context

Analysis of 2026-09-02 estimated a Rust client at about 1 ms startup plus
sub-millisecond calls, against the measured 3 ms of a raw `gdbus call` and
9 ms for `wctl list`. The estimate is unverified: zbus's blocking API starts an
internal executor thread, and its cost on this machine is unknown. Extension
running: GNOME 46, interface `org.gnome.Shell.Extensions.WindowControl` on
`org.gnome.Shell`. Scratch area: `hako-private/` (covered by the global
gitignore, never committed).

## Problem

If a zbus blocking client costs 10 ms per invocation instead of 1 ms, the
rewrite loses its speed argument and the epic should be re-scoped before the
crate is built. This task ends with numbers and a go/no-go, not with code
that is kept.

## Recommended action

In `hako-private/zbus-spike/`, `cargo init` a binary with `zbus` (blocking
feature, no tokio) and `serde_json`. It should:

1. Open `zbus::blocking::Connection::session()`.
2. Build a `zbus::blocking::Proxy` for destination `org.gnome.Shell`, path
   `/org/gnome/Shell/Extensions/WindowControl`, interface
   `org.gnome.Shell.Extensions.WindowControl`.
3. Call `GetFocused` and print the `(u64, String, String)` reply.
4. Call `ListDetailed`, parse the string with `serde_json::from_str::<Vec<serde_json::Value>>` and print the length.

Build with `cargo build --release`. Measure the median wall time of 10 runs
for: the spike binary; `gdbus call --session --dest org.gnome.Shell
--object-path /org/gnome/Shell/Extensions/WindowControl --method
org.gnome.Shell.Extensions.WindowControl.GetFocused`; and `./wctl focused`.
Use `date +%s%N` before and after, in a loop, on the live session with the
extension enabled (check with `./wctl focused` first). Also record the release
binary size, the number of crates in `cargo tree | wc -l`, and the cold build
time.

## Acceptance criteria

- [ ] A comment on this issue holds a table: median ms for spike, raw gdbus, and `wctl focused`, plus binary size, crate count and cold build seconds
- [ ] If the spike median is at most 5 ms: comment says "go", and the crate feature issue is left as filed
- [ ] If the spike median is above 5 ms: comment names where the time goes (measured, e.g. with `strace -r` or `perf`), and the epic is updated with the finding before any crate work starts
- [ ] Nothing from `hako-private/zbus-spike/` is committed
