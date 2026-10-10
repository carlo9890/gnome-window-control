# Reviewing

Project-specific review rules. The generic review lenses are covered by the
`project-review-*` skills — this file records only the local delta. Where it
conflicts with a skill's default, this file wins.

## Quality rules

How finished code must look. Each rule is a condition to check on the diff, with
the correct form.

- **SPDX header**: a new `.js` or `.rs` file starts with the two SPDX lines —
  `// SPDX-FileCopyrightText: 2026 hko9890` and `// SPDX-License-Identifier: MIT`.
  Flag a new file without them; no gate catches a missing header.
- **Handler errors**: a D-Bus method implementation is wrapped in try/catch and
  returns a graceful default on error (empty array, `false`, etc.) — no exception
  escapes a handler. Flag a handler that lets one escape. Two cases are correct
  and are no finding: a handler that goes through `_actOnWindow`, and `Move`,
  `Resize`, `MoveResize`, `WaitForWindow` and `WaitForGeometry`, which raise named
  D-Bus errors ([CODING.md](CODING.md#javascript-extensionjs) has both).
- **Log levels**: per-call handler logging uses `console.debug()`; `console.log()`
  appears only in the enable/disable lifecycle; `console.error()` appears ONLY in
  a catch block. Flag each other use. `console.log()` is visible by default
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

## Project-specific rules

- A new D-Bus method comes with its row in the method table in `README.md` — flag
  a method in `dbus-interface.js` that the table does not list.
