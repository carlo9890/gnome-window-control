# Reviewing

Project-specific review rules. The generic review lenses are covered by the
`project-review-*` skills — this file records only the local delta. Where it
conflicts with a skill's default, this file wins.

## extensions.gnome.org review

Required for every review that touches `window-control@carlo9890.github.io/`.
A human reviewer on extensions.gnome.org reads every file of each upload and
rejects it at the first violation; a rejection costs a release and weeks in the
queue. This review runs first, so that one passes. Do every step, on every such
review:

1. Fetch the
   [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
   and the
   [best practices](https://gjs.guide/extensions/review-guidelines/best-practices.html)
   with WebFetch.
2. Check every `.js` file under `window-control@carlo9890.github.io/` against
   every rule on both pages, the files the change leaves untouched included:
   the reviewer rejects the upload, not the diff.
3. Read every comment as that reviewer does: it reads as a human maintainer
   wrote it, by the
   [AI-generated](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#extensions-must-not-be-ai-generated)
   and [Comments](https://gjs.guide/extensions/review-guidelines/best-practices.html#comments)
   rules.
4. Run shexli, GNOME's own analyzer, from the repo root. Pin `tree-sitter`:
   shexli 0.2.1 pins neither dependency, and tree-sitter 0.26.0 segfaults it
   before any output. Pass the absolute path; a relative one fails with a
   `ValueError`.

   ```bash
   pip install -U shexli 'tree-sitter==0.25.2'
   shexli "$PWD/window-control@carlo9890.github.io"
   ```

5. The pages win over everything in this repository: this file, CODING.md, a
   code comment, existing code and a test. A test that pins a pattern the
   pages reject is wrong; change the test with the code.
6. Each guideline violation, and each shexli finding that
   [Out of scope](#out-of-scope--non-blocking) does not list, blocks the
   merge. Its fix is a code change in the same PR. A follow-up, a "not
   applied" outcome, or a prepared answer for the extensions.gnome.org
   reviewer leaves it open.
7. Out of scope is the maintainer's: a change that adds an entry there, for a
   guideline point or a shexli finding, fails this review.

The review is done when the extensions.gnome.org reviewer could read every file
and find nothing to reject. "Probably" is not done.

## Quality rules

How finished code must look. Each rule is a condition to check on the diff, with
the correct form.

- **SPDX header**: a new `.js` or `.rs` file starts with the two SPDX lines —
  `// SPDX-FileCopyrightText: 2026 hko9890` and `// SPDX-License-Identifier: MIT`.
  Flag a new file without them; no gate catches a missing header.
- **Log levels**: per-call handler logging uses `console.debug()`; `console.log()`
  appears only in the enable/disable lifecycle; `console.warn()` appears only
  where the extension turns a feature off and keeps running: a `rules.json` that
  fails validation (`WindowRules._compile`, see
  [RULES-JSON.md](specs/RULES-JSON.md)) and a shortcut that cannot be registered
  (`WindowKeybindings.enable`); `console.error()` appears ONLY in a catch block.
  Flag each other use. `console.log()` is visible by default
  (journald priority 5, see [MONITORING.md](MONITORING.md)), so a per-call
  `console.log()` leaves a journal line per `wctl` invocation that outlives the
  session.
- **Log content**: no log line, at any level, holds window content or a
  caller-supplied match value — not a title, and not a WM class. A line logs the
  method name and the outcome. A keyword argument (`WaitForWindow`'s `kind`) is
  fine **once it has been validated** against the four keywords — flag one that is
  logged before that: it lets any process on the session bus write arbitrary
  text, newlines included, into the journal. The value it matches against is
  never logged.
- **Client text in plain output**: a window field a client sets (a title, a
  `wm_class`, any other window field) that `wctl` prints outside `--json` goes
  through `table::sanitize` in `cli/src/table.rs`. `table::render` already
  sanitizes every cell; flag a field printed by any other path without it. A
  raw newline in a title forges a row or a field of the output.

## Project-specific rules

- A new D-Bus method comes with its row in the method table in `README.md` — flag
  a method in `dbus-interface.js` that the table does not list.
- A script under `scripts/` that sends a state-changing call to `org.gnome.Shell`
  refuses to run on the login session bus unless the caller opts in. Flag one
  without that guard; `scripts/debug-dbus.sh` is the correct form: it compares
  `DBUS_SESSION_BUS_ADDRESS` with the bus `systemctl --user show-environment`
  reports, and `--real-session-ok` is the opt-in.

## Out of scope / non-blocking

- These shexli findings are no defect; do not "fix" them. Answer the
  extensions.gnome.org reviewer with the reason each one gives:
  - `EGO-C49-003` / `EGO-C49-004` (errors): `Meta.MaximizeFlags` and
    `get_maximized()` are reported as removed-on-49 API. `get_maximized()` and
    the `maximize()` / `unmaximize()` calls that pass a flags argument sit behind
    the `typeof win.get_maximized === 'function'` feature detection in
    `maximizeFlags` / `maximizeWindow` / `unmaximizeWindow`
    (`window-helpers.js`), so none of them runs on GNOME 49. The
    `Meta.MaximizeFlags` enum itself is still there on 49 and later, as the type
    `get_maximize_flags()` returns; `isFullyMaximized` (`window-helpers.js`) and
    `_frameRefusal` (`dbus-service.js`) compare against it on every version. Answer
    the reviewer with the guard and the enum. Narrowing `shell-version` to 45-48
    clears both findings and costs the 49/50 users — `shell-version` cannot be
    widened again without a new review.
