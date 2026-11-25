# Coding

```bash
./scripts/build.sh validate   # node --check on every extension *.js, uuid, interface XML, schema
./scripts/build.sh all        # validate, then build the zip into dist/
./scripts/build.sh install    # copy the extension into place; the reload is in RUNNING.md
mise run ci                   # cli/: fmt, clippy, tests, build, on the toolchain .mise.toml pins
```

Run `./scripts/build.sh validate` after every change to a `.js` file, with
`node` installed: without it, validate skips the syntax check and still passes.
Do not commit while it fails: CI runs the same check as a gate.

After a change to `install-wctl.sh` or `scripts/release.sh`, run it offline as
[TESTING.md](TESTING.md#driving-install-wctlsh-and-releasesh-offline) says: CI
does not run either script end to end.

## The extension

- Read the GNOME guidelines that the
  [extensions.gnome.org review](REVIEWING.md#extensionsgnomeorg-review) links
  before you write extension code. A human reviews every line of each upload,
  and a violation costs a release.
- Use ES modules.
- Keep each module in its process. `extension.js` and its imports run in GNOME
  Shell and never import `Gtk`, `Gdk` or `Adw`. `prefs.js` and `prefs/` run in
  the preferences process and never import `Meta`, `St`, `Clutter` or `Shell`.
  `rules-format.js` loads in both and imports nothing. Put a module that only
  `prefs.js` loads in `prefs/`.
- Make `disable()` undo everything `enable()` did: every signal handler, GLib
  source, bus-name watch, file monitor, cancellable, keybinding and pending
  `...Async` invocation. extensions.gnome.org rejects an upload that does not.
  Keep each ID where the teardown reaches it. Create a new timeout with
  `addTimeout` and end it with `removeSource` from `window-helpers.js`, on a
  `sourceIds` set that `disable()` or `unexport()` empties, as `rules.js` and
  `dbus-service.js` do. `overlay.js` and `WindowPlacer` keep a timer ID on the
  object their teardown clears. Add a case
  to `tests/check-extension-headless.js` for each new handler or source: it
  checks only those it is told about.
- Send every frame request (a position or a size) for a shown window through
  `WindowPlacer.place` in `window-helpers.js`, and call the placer's
  `moveResizeFrame`, `move` or `resize` inside it, never `Meta.Window`
  directly. Pass the target monitor as the third argument when the request can
  change monitor. Three kinds stay outside, as the comments there say: a move
  to a monitor (`moveToMonitor`), the maximize and fullscreen state methods,
  and the rule frame set inside mutter's `configure` signal in `rules.js`.

## D-Bus handlers

- Write no try/catch in a synchronous handler: GJS answers the caller for a
  throw. What the caller then sees is in
  [MONITORING.md](MONITORING.md#what-a-wctl-error-means).
- Raise a named D-Bus error, and declare no `success` out-argument, in a method
  that can fail for more than one reason
  ([0005](decisions/0005-the-geometry-methods-applyrules-and-the-wait-methods-raise-named-d-bus-errors.md)
  lists the methods that do).
- In `Move`, `Resize`, `MoveResize` and `ApplyRules`, run the body through the
  named-error helper in `dbus-service.js`: throw a `NamedError` there. The
  wait handlers send their error with `invocation.return_dbus_error`.
- Put a new error name in the ERRORS block of `dbus-interface.js`, a
  `DBUS_ERROR_*` constant in `dbus-service.js`, the Errors section of
  `docs/user-guide/dbus.md`, and an `ERROR_*` constant in `cli/src/dbus.rs`
  that `map_err` maps to an exit code.

## wctl (cli/)

- Validate every argument before the first D-Bus call. Parse with
  `selector::parse_exact` or `parse_min`, validate the arguments after the
  selector, and only then call `selector::lookup`, which may use the bus.
- Report failure through `Fail` in `cli/src/fail.rs` and end each command in
  `report()`.
- Put pure logic (geometry, tokens, selector parsing) in `geometry.rs` or
  `selector.rs`, with unit tests as [TESTING.md](TESTING.md#write-a-test) says.
- Gate a call to a method or behaviour newer than `MIN_EXTENSION_VERSION`
  (`cli/src/main.rs`) on its capability name from `GetCapabilities`, as
  `NEWER_MATCH_KEYS` in `cli/src/commands/rules.rs` does
  ([0008](decisions/0008-a-client-learns-what-the-extension-supports-from-a-capability-name.md)).
  Only the maintainer raises that baseline.
- Change no output string, usage text or exit code without the suite that pins
  it. Write argument parsing, help and completions by hand
  ([0009](decisions/0009-wctl-parses-its-arguments-by-hand.md)).
- Give a limit that the extension enforces too (a range, a keyword set, a
  message) one value, in a file under `tests/vectors/`, read by both sides
  ([0007](decisions/0007-the-rules-json-grammar-has-two-implementations-pinned-to-one-vector-file.md)).

## Add a D-Bus method

1. Add the method to the interface XML in `dbus-interface.js`.
2. Add the handler to `WindowControlService` in `dbus-service.js`. For an
   action on one window that returns a boolean, copy the form of `Close`.
3. Add its capability name to `CAPABILITIES` in `dbus-service.js` in the same
   commit.
4. For a method that raises named errors, follow
   [D-Bus handlers](#d-bus-handlers): write a `<Method>Async` handler whose body
   runs through the named-error helper, or one that calls
   `invocation.return_dbus_error`. A synchronous handler cannot raise a named
   error. Call it from Rust with `call_unit`, not `call_bool`.
5. Add the command. A window-only boolean action needs no new function: add a
   match arm in `cli/src/main.rs` that calls `state::simple`, as `close` does.
   Otherwise write the function in the module of its group in
   `cli/src/commands/`.
6. Add the command to `COMMANDS` in `cli/src/main.rs`, to `cli/src/help.rs`,
   and to both scripts in `cli/completions/`. The inventory tests fail
   `cargo test` when one is missing.
7. Add the method's row to the method table in `docs/user-guide/dbus.md`, and
   the command's line to `docs/user-guide/wctl.md`.
8. Run the checks in [TESTING.md](TESTING.md#minimum-checks-before-a-pr).

## Change the rules format

Change all of these in one commit:

1. [docs/specs/RULES-JSON.md](specs/RULES-JSON.md): read it first; change it
   where the change alters what an implementation MUST do.
2. `rules-format.js`: `RULE_KEYS` and `compileRule` for a rule key,
   `MATCH_KINDS` and `matchPredicate` for a match key. How a rule key is
   applied is in `rules.js`.
3. `cli/src/rules.rs`: `RULE_KEYS` and `compile_rule`, or `MATCH_KEYS` and
   `Rule::matches_window`; a rule key also in `Rule::resolve`; a match key
   also in `shadows` in `cli/src/commands/rules.rs`.
4. `tests/vectors/rules-spec.json`: a case for each new value and each new
   message.
5. For a new key: its capability name in `CAPABILITIES` in `dbus-service.js`
   and in `NEWER_MATCH_KEYS` or `NEWER_RULE_KEYS` in
   `cli/src/commands/rules.rs`; a `wctl rules add` flag also in `help.rs` and
   `cli/completions/`; its line in the key table of `docs/user-guide/rules.md`
   and its row in "Keys that need a newer extension".
