# Coding

Code style, mandatory syntax validation, building, and how to add a new D-Bus
method end-to-end.

## JavaScript syntax validation (CRITICAL)

When modifying any JavaScript file you **MUST** validate its syntax before
finishing:

```bash
node --check window-control@carlo9890.github.io/extension.js
node --check window-control@carlo9890.github.io/dbus-interface.js
```

If either fails, the code has a syntax error and must not be committed.
`scripts/build.sh validate` runs `node --check` on every `*.js` in the extension
directory, and `.github/workflows/build.yml` runs it as a hard CI gate — so a
syntax error fails the build.

## JavaScript style (extension.js)

- Use ES module (ESM) syntax.
- Use `const`/`let`, never `var`.
- Use template literals for string interpolation.
- Wrap D-Bus method implementations in try/catch and return graceful defaults on
  error (empty array, `false`, etc.) — never let an exception escape a handler.
  **Exception: `Move`, `Resize` and `MoveResize` raise named D-Bus errors
  instead.** A boolean cannot say *which* failure happened, and a client outside
  the shell cannot work it out — it can read `is_maximized`/`is_fullscreen` but
  has no tiled predicate at all. Those three go through `_geometryCall()`, which
  still catches an unexpected exception and re-raises it as
  `org.freedesktop.DBus.Error.Failed`, so nothing escapes untyped. The error
  names are listed in the ERRORS block in `dbus-interface.js`; add to that list
  rather than inventing a name at the throw site.
- Simple "find window by id, do one action, return bool" handlers should go
  through the shared `_actOnWindow(windowId, label, action)` helper rather than
  re-implementing the find/try-catch/log skeleton.
- Use `console.debug()` for per-call handler logging, `console.log()` only for
  the enable/disable lifecycle, and `console.error()` ONLY in catch blocks.
  `console.log()` is visible by default (journald priority 5, see
  [MONITORING.md](MONITORING.md)), so a per-call `console.log()` leaves a journal
  line per `wctl` invocation that outlives the session.
- Never log window content or a caller-supplied match value, at any level — not a
  title, and not a WM class. Log the method name and the outcome. A keyword
  argument (`WaitForWindow`'s `kind`) is fine **once it has been validated**
  against the four keywords — logged before that, it lets any process on the
  session bus write arbitrary text, newlines included, into the journal. The
  value it matches against is never logged.

## Rust style (cli/)

- The toolchain is pinned in `.mise.toml`. Run the gates through mise:
  `mise run fmt`, `mise run lint`, `mise run test`, `mise run build`, or
  `mise run ci` for all of them (see [TESTING.md](TESTING.md)).
- `cargo fmt` is authoritative; clippy must be clean with warnings as errors.
- Validate arguments before any D-Bus call. The session connection is opened
  lazily in `dbus.rs`, so a usage error must never reach it — that is what keeps
  the guard tests headless. Parse the selector with `selector::parse_exact`
  (or `parse_min`), validate every argument after `selector.shift`, and only
  then call `selector::lookup` — that one may hit the bus.
- Report failure through `Fail`: `Fail::error` for the `Error: ...` on stderr,
  `Fail::plain` for the extension-said-no message on stdout. Every command ends
  in `report()` so they all behave the same way.
- Keep pure, testable logic (geometry math, token resolution, selector parsing)
  in `geometry.rs` and `selector.rs` with `#[cfg(test)]` unit tests that pin
  **hardcoded** expected values.
- The CLI grammar is a frozen contract: output strings, usage text and exit
  codes are asserted by the live suites. Do not reword a message without
  changing the suite that pins it.

## Building for distribution

```bash
./scripts/build.sh all         # clean, validate (incl. node --check), build zip
./scripts/build.sh install     # copy the extension into place for local testing
```

The zip lands in `dist/window-control@carlo9890.github.io_v<version>.zip` and
includes every file in the extension directory (`extension.js`,
`dbus-interface.js`, `metadata.json`, `README.md`, `LICENSE`). The directory name
must stay identical to the `uuid` in `metadata.json` — `build.sh validate`
hard-fails if they diverge.

## Adding a new D-Bus method

1. Add the method signature to the interface XML in
   `window-control@carlo9890.github.io/dbus-interface.js`:

   ```xml
   <method name="YourNewMethod">
     <arg type="t" direction="in" name="window_id"/>
     <arg type="b" direction="out" name="success"/>
   </method>
   ```

2. Add the implementation in the `WindowControlService` class in `extension.js`.
   For a simple boolean action, reuse `_actOnWindow`:

   ```javascript
   YourNewMethod(windowId) {
       return this._actOnWindow(windowId, 'YourNewMethod', win => win.someAction());
   }
   ```

   > GJS quirk: D-Bus `t` (uint64) args arrive as plain JS numbers, which lose
   > precision above 2^53. Mutter window IDs are well within that range, but if a
   > method ever handles larger uint64 values, use `BigInt`/`GLib.Variant`.

   > A method that can fail for more than one reason should raise a named error
   > (see the JS style rules above) and declare no `success` out-arg. Add the
   > name to `ERROR_*` in `cli/src/dbus.rs` so `map_err` maps it to the right
   > exit code, and call it with `call_unit` rather than `call_bool`.

3. Add the corresponding command to the crate, reusing the shared helpers.
   A simple boolean action is one line in `cli/src/commands/state.rs`:

   ```rust
   pub fn your_new_command(ctx: &mut Ctx, args: &[String]) -> Result<()> {
       let selector = selector::parse_exact(0, "Usage: wctl your-new-command <WINDOW>", args)?;
       // Validate any argument after selector.shift HERE, before lookup().
       let id = selector::lookup(ctx, &selector)?;
       let ok = ctx.bus.call_bool("YourNewMethod", &(id,))?;
       report(ok, "Did the thing", not_found(id))
   }
   ```

   Wire it into the `match` in `cli/src/main.rs`.

4. Add it to `COMMANDS` in `cli/src/main.rs`, to the help text in
   `cli/src/help.rs`, and to **both** completion scripts in `cli/completions/`.
   The inventory unit tests cross-check all four, so a command that is missing
   from any of them fails `cargo test`.

5. Update the method table in `README.md`.

6. Run `mise run ci` and `node --check` before committing.
