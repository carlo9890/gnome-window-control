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

Any task that modifies JS code must include:

```markdown
- [ ] Code passes syntax check (`node --check <file>`)
```

## JavaScript style (extension.js)

- Use ES module (ESM) syntax.
- Use `const`/`let`, never `var`.
- Use template literals for string interpolation.
- Wrap D-Bus method implementations in try/catch and return graceful defaults on
  error (empty array, `false`, etc.) — never let an exception escape a handler.
- Simple "find window by id, do one action, return bool" handlers should go
  through the shared `_actOnWindow(windowId, label, action)` helper rather than
  re-implementing the find/try-catch/log skeleton.
- Use `console.debug()` for per-call handler logging, `console.log()` only for
  the enable/disable lifecycle, and `console.error()` ONLY in catch blocks.
  `console.log()` is journald priority 5 and IS visible by default — it is not
  filtered. See [MONITORING.md](MONITORING.md) for the verified level table.
- Never log a window title or a caller-supplied match string, at any level. Log
  the method name and the outcome.

## Bash style (wctl)

- `#!/usr/bin/env bash` shebang; `set -euo pipefail`.
- Quote variables: `"$var"`.
- Use `[[ ]]` for conditionals.
- Validate arguments before D-Bus calls via `validate_id` and the inline guards,
  and report outcomes through the shared `report_result` helper so every command
  behaves and reports identically.
- Keep pure, testable logic (geometry math, token resolution) in standalone
  functions so `tests/test-logic.sh` can unit-test them headlessly.

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

3. Add the corresponding command to `wctl`, reusing the shared helpers:

   ```bash
   cmd_your_new_command() {
       local id="${1:-}"
       [[ -z "$id" ]] && die "Usage: wctl your-new-command <ID>"
       validate_id "$id"

       local raw
       raw=$(dbus_call "YourNewMethod" "$id")
       report_result "$raw" "Did the thing" "$id"
   }
   ```

   Wire it into `main()`'s dispatch `case`.

4. Update the help text **and both shell completions** in `wctl`. The
   command-inventory test in `tests/test-logic.sh` cross-checks the help text and
   both completions against its `EXPECTED_COMMANDS` list, so update that list too.
   (Dispatch is covered functionally by the argument-guard tests — an unwired
   command falls through to "Unknown command" and fails them.)

5. Update the method table in `README.md`.

6. Run `bash tests/test-logic.sh` and `node --check` before committing.
