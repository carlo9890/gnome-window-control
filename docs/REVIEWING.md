# Reviewing

Call the Skill tool with `project-review:project-review-change` for the rules
review, or with `worktree-flow:worktree-review` to review a PR and push the
fixes. **Local delta:** the rules below, which win where they disagree with the
skill.

## extensions.gnome.org review

Run it first on every review that touches `window-control@carlo9890.github.io/`.
A human reviewer on extensions.gnome.org reads every file of an upload and
rejects it at the first violation; a rejection costs a release and weeks in the
queue.

1. Fetch the
   [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
   and the
   [best practices](https://gjs.guide/extensions/review-guidelines/best-practices.html)
   with WebFetch.
2. Check every `.js` file under `window-control@carlo9890.github.io/` against
   every rule on both pages, the files the change leaves untouched included:
   the reviewer rejects the upload, not the diff.
3. Read every comment as that reviewer does, by the
   [AI-generated](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#extensions-must-not-be-ai-generated)
   and [Comments](https://gjs.guide/extensions/review-guidelines/best-practices.html#comments)
   rules.
4. Run shexli, the analyzer of extensions.gnome.org, from the repo root. Pin
   `tree-sitter`, because 0.26.0 segfaults shexli 0.2.1; pass an absolute path,
   because a relative one fails with a `ValueError`:

   ```bash
   pip install -U shexli 'tree-sitter==0.25.2'
   shexli "$PWD/window-control@carlo9890.github.io"
   ```

5. Where the pages reject a pattern, they win over this repository: its docs,
   a code comment, existing code and a test. A test that pins a rejected
   pattern changes with the code.
6. Each guideline violation, and each shexli finding that
   [Out of scope](#out-of-scope--non-blocking) does not list, blocks the merge.
   Fix it in the same PR. A follow-up, a "not applied" outcome or a prepared
   answer for the reviewer leaves it open.
7. Out of scope belongs to the maintainer. Flag a change that adds an entry
   there.

The review is done when the extensions.gnome.org reviewer could read every file
and find nothing to reject.

## Quality rules

How finished code must look. Each rule is a condition to check on the diff,
with the correct form.

- **SPDX header**: a new `.js` or `.rs` file starts with
  `// SPDX-FileCopyrightText: 2026 hko9890` and
  `// SPDX-License-Identifier: MIT`. No gate checks it; flag a new file without
  them.
- **Log levels**: a per-call handler logs with `console.debug()`.
  `console.log()` is for the enable/disable lifecycle only, because it is
  visible by default and a per-call line outlives the session
  ([MONITORING.md](MONITORING.md)). `console.warn()` is for a feature the
  extension turns off while it keeps running: a rules file that fails
  validation, a shortcut that cannot be registered. `console.error()` is for a
  catch block only. Flag each other use.
- **Log content**: a log line holds the method name and the outcome, never a
  title, a WM class or another caller-supplied match value. A keyword argument,
  such as `WaitForWindow`'s `kind`, may be logged once it has been validated;
  flag one logged before that, because any process on the session bus could
  write text into the journal.
- **No dynamic code or processes**: extension code calls no `eval()` or
  `Function()` and starts no process (`GLib.spawn*`, `Gio.Subprocess`,
  `Util.spawn*`, a `Gio.AppInfo` launch or any other way), and the zip ships no
  generated code. `openPreferences()` is allowed. The correct form does the
  work in-process through Meta and Gio; work that needs a process goes in
  `wctl`. This is stricter than the extensions.gnome.org guidelines on purpose.
- **Client text in plain output**: a window field a client sets, such as a title
  or a `wm_class`, that `wctl` prints outside `--json` goes through
  `table::sanitize` in `cli/src/table.rs`; `table::render` already does. Flag a
  field printed another way: a raw newline in it forges a row.

## Project-specific rules

- **Scope.** Each of these blocks the merge until the maintainer approves it on
  the PR:
  - extension code that reads pixels, injects input or ends a window's client
    (`kill()`, a signal to its PID);
  - a new or changed D-Bus method that lays out windows, `ApplyRules` excepted
    ([0001](decisions/0001-the-d-bus-interface-offers-geometry-primitives-and-no-layout.md));
  - a new property in the `ListDetailed` window document, or window data that
    another method returns and `ListDetailed` does not;
  - any other D-Bus addition that does not act on a window's geometry, state,
    workspace, focus or close.

  The correct forms: `wctl tile` and `wctl center` compose a layout from
  `Move`, `MoveResize` and `GetWorkarea`; rules and shortcuts take their
  rectangles from `rules-format.js`; `Close` uses `Meta.Window.delete`.
- A row in the method table of `docs/user-guide/dbus.md` gives the signature
  and the description of the interface XML. `tests/check-dbus-doc-table.sh`
  checks the method names only.
- A script under `scripts/` that sends a state-changing call to
  `org.gnome.Shell` refuses the login session bus unless the caller opts in.
  `scripts/debug-dbus.sh` and its `--real-session-ok` flag are the correct form.

## Out of scope / non-blocking

- shexli `EGO-C49-003` and `EGO-C49-004` (removed-on-49 API) are no defect; do
  not "fix" them. Answer the extensions.gnome.org reviewer: every call to
  `get_maximized()`, and every `maximize()` or `unmaximize()` with a flags
  argument, sits behind the feature test in `window-helpers.js` and does not run
  on GNOME 49; the `Meta.MaximizeFlags` enum still exists on 49 and later as the
  type `get_maximize_flags()` returns
  ([0006](decisions/0006-one-extension-serves-gnome-shell-45-to-50.md)).
