---
id: gnomewindo-j2b66c
title: Submit v8 to extensions.gnome.org
status: open
type: chore
priority: 2
creator: hans
blocked_by:
  - gnomewindo-vx3u87
created: 2026-09-02T06:24:40Z
updated: 2026-09-02T06:24:40Z
---

## Context

The extension is distributed only through GitHub releases. extensions.gnome.org
(EGO) is the channel users actually find, and nothing has been submitted there
yet — there is no listing and no account association.

v8 was prepared specifically to clear EGO's requirements:

- UUID is `window-control@carlo9890.github.io` — the part after `@` is a domain
  the author controls, which EGO requires. It is permanent once a listing is
  live.
- `metadata.json` carries `url`, `version-name`, and a `description` that states
  what is registered on D-Bus and that the interface has no access control.
- SPDX headers in both sources; `LICENSE` ships inside the zip. MIT is
  GPL-compatible, which EGO accepts.
- Red-flag scan over both zipped sources is clean: zero hits for `eval(`,
  `new Function`, `Gio.Subprocess`, `GLib.spawn`, `imports.`, `Lang.bind`,
  `timeout_add`, `idle_add`, `later_add`, `.connect(`, `Main.`, `Soup`, `fetch(`.
  No signals and no timers, so `disable()` has nothing to clean up beyond its one
  unexport — the most common rejection reason does not apply.

`docs/RELEASING.md` holds the upload path, the review constraints the code must
keep satisfying, and a prepared answer for the reviewer.

Asset: https://github.com/carlo9890/gnome-window-control/releases/tag/v8

## Problem

Submission has not happened. Two things about the process make it worth doing
deliberately rather than ad hoc:

- Review is by a human who reads every line, and the queue runs to weeks. A
  rejection for something avoidable costs a full cycle.
- Expect one substantive question: the interface is callable by any application
  in the session with no access control. This is the extension's purpose, not an
  oversight, and `docs/RELEASING.md` has a prepared answer. Do NOT respond by
  offering a caller allowlist or a shared-secret token — both are unenforceable
  between same-user processes and reviewers read them as theater.

`shell-version` claims 45-50 while only 46 has been tested. This was a deliberate
choice for reach. If the reviewer tests on another version and hits the GNOME 49+
maximize API path (`extension.js`, `_isFullyMaximized` / `_maximizeWindow`), that
is a rejection.

## Recommended action

Upload `window-control@carlo9890.github.io_v8.zip` at
https://extensions.gnome.org/upload/, following the "Publishing to
extensions.gnome.org (EGO)" section of `docs/RELEASING.md`.

Build the zip with `./scripts/build.sh all` rather than reusing an old artifact,
so `metadata.json` sits at the archive root.

Record the listing URL here. If the reviewer comes back with changes, file them
as separate issues rather than growing this one — each new version is a fresh
upload and a fresh review.

## Acceptance criteria

- [ ] The v8 zip is uploaded and the listing exists on extensions.gnome.org in a pending/unreviewed state
- [ ] The listing URL is recorded as a comment on this issue
- [ ] `docs/RELEASING.md` is updated with the listing URL so the next release knows where it goes
- [ ] Any reviewer feedback is captured as its own issue, linked to this one, rather than fixed silently
- [ ] The issue is closed only when the listing is live, or when a rejection and its reasons are recorded here
