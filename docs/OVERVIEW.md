# Overview

GNOME Shell extension that exposes a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a Rust CLI over that interface. Targets GNOME
Shell 45-50.

## Repository layout

```
window-control@carlo9890.github.io/   GNOME Shell extension (dir name == uuid)
├── extension.js           enable()/disable()
├── dbus-service.js        the D-Bus handlers (WindowControlService)
├── dbus-interface.js      the D-Bus interface XML
├── rules.js               auto-placement (WindowRules)
├── rules-files.js         reads rules.json and the rules.d drop-ins
├── overlay.js             overlay windows (WindowOverlays)
├── keybindings.js         the shortcuts (WindowKeybindings)
├── indicator.js           the top-bar icon
├── rules-format.js        the rules.json grammar; imports NOTHING
├── window-helpers.js      the helpers shared by the modules, and WindowPlacer
├── prefs.js, prefs/       the preferences window (its own process)
├── schemas/               the GSettings schema
├── metadata.json          uuid, shell-version, url, version-name
└── LICENSE                copy of the top-level LICENSE, shipped in the zip
cli/                       wctl, the CLI (Rust, zbus)
├── src/main.rs            argument dispatch, command inventory
├── src/dbus.rs            the D-Bus client
├── src/rules.rs           the rules.json grammar, the Rust half of the pair
├── src/commands/          one module per command group
├── completions/           hand-written bash and zsh completions
└── tests/cli.rs           argument-guard tests
scripts/                   build, release, version checks, test shells
└── demo/                  records the user guide's demo GIFs
tests/                     test suites (see docs/TESTING.md)
└── vectors/               shared test vectors read by GJS and Rust alike
docs/                      developer topic docs (this directory)
├── decisions/             the design decisions in force
├── specs/                 normative format specs
├── user-guide/            user docs, one page per task
└── images/                the guide images, the demo GIFs and the listing icon
.github/workflows/         CI (build.yml)
dist/                      build output (generated zips)
install-wctl.sh            wctl installer
README.md                  the product page; links the user guide
```

Each module's header comment says what it holds.

## Architecture & key concepts

- The extension registers its D-Bus object on **GNOME Shell's own bus
  connection**, so the destination is `org.gnome.Shell` (not a standalone
  service). Path `/org/gnome/Shell/Extensions/WindowControl`, interface
  `org.gnome.Shell.Extensions.WindowControl`. Who can call it is in
  `docs/user-guide/security.md`.
- **The D-Bus surface is fixed in scope**: it offers no layout, except
  `ApplyRules`, which applies the rules files again
  ([0001](decisions/0001-the-d-bus-interface-offers-geometry-primitives-and-no-layout.md));
  what it must not grow is in [REVIEWING.md](REVIEWING.md#project-specific-rules).
- `dbus-service.js` holds one `WindowControlService` class; the simple boolean
  handlers share the `_actOnWindow(id, label, action)` helper. The interface XML
  lives in `dbus-interface.js` and is imported into `dbus-service.js`.
  `extension.js` only starts and stops the service, `WindowRules`,
  `WindowKeybindings` and the `WindowPlacer` the three share, adds and removes
  the top-bar icon (`_syncIndicator`),
  and removes the shortcuts and the icon while the screen is locked
  (`_syncSessionMode`); the service and the rules stay up
  ([0003](decisions/0003-the-d-bus-interface-and-the-rules-stay-up-while-the-session-is-locked.md)).
- `wctl` speaks D-Bus directly through **zbus's blocking API**, and its
  release asset is a static musl binary with no runtime dependencies
  ([0004](decisions/0004-the-wctl-release-asset-is-one-static-binary-with-no-runtime-dependencies.md)).
  Failures funnel through `map_err`
  (a call) and `map_connect_err` (the connection) in `dbus.rs` for a
  consistent hint.
- The session connection is opened **lazily**, so every argument-validation error
  is reported without touching the bus. That is what keeps the guard tests in
  `cli/tests/cli.rs` headless.
- Window documents stay as `serde_json::Value` (with serde_json's
  `preserve_order`), because `list --json` and `info --json` must emit the
  extension's document unchanged, key order included.
- One code base runs across GNOME 45-50 via runtime API detection for
  the maximize path (`get_maximized()` vs `get_maximize_flags()`):
  [0006](decisions/0006-one-extension-serves-gnome-shell-45-to-50.md).
- `WaitForWindow` and `WaitForGeometry` are the **async** handlers (the GJS
  `...Async(params, invocation)` convention), holding the invocation in
  `_waiters` / `_geometryWatchers`. A window satisfies a waiter only once it is
  shown — `_isUnshown` and `_evaluateWindow` in `dbus-service.js` say why, and
  the `disable()` teardown rule is in [CODING.md](CODING.md#javascript-the-extension).
- **Auto-placement** lives in `rules.js` (`WindowRules`), separate from the D-Bus
  service: it reads `~/.config/gnome-window-control/rules.json`, then the
  drop-in files in `rules.d/` that other programs own (the order and the
  per-file loading are in the spec), watches
  `window-created`, and places a matching window once mutter has shown it. It
  makes no D-Bus call; `ApplyRules` in `dbus-service.js` calls its
  `applyRules` to place the open windows again. The GNOME-49 maximize API detection is shared with
  `dbus-service.js` through `window-helpers.js`.
- **The frame requests of a shown window go through one `WindowPlacer`**
  (`window-helpers.js`): the shortcuts, a rule's geometry and the `Move`,
  `Resize` and `MoveResize` handlers. A window has at most one placement
  pending, and the newest of these requests wins. A move to a monitor
  (`MoveToMonitor`, a rule's `monitor`) runs at once, outside it, and drops
  a pending placement for another monitor. A rule's
  first apply enters it only after the waits in
  [RULES-JSON.md](specs/RULES-JSON.md#matching-and-application). A
  maximized window is restored first and placed once the restore has landed
  (`UnmaximizeWait`). `moveResizeFrame` requests a frame as the program, not
  as the user, so a window whose minimum size is above its tile still moves.
  A resize that the client has not answered yet stays in the placer, and a
  `Move` or `Resize` in that time builds on it: on Wayland the late answer
  would otherwise put the window back.
- In `rules.js`, a geometry request only
  sticks after the window is shown (the same constraint `WaitForWindow` documents
  above), so a rule waits for `shown` and then applies from an idle callback; a
  window that maps maximized is unmaximized first. On GNOME 49 and later the
  frame also goes into the window's initial configuration (`_preplace`, the
  `configure` signal), so the first frame is drawn in place.
- **Overlay windows** are the one rules.json effect that outlives a window's
  first placement: `WindowRules` decides membership at each apply and at each
  load, for the open windows too (`_syncOverlays`), and `WindowOverlays` in
  `overlay.js` keeps a member above, out of Alt+Tab, and minimizes it on focus
  loss and when the overview opens.
- **Keyboard shortcuts** live in `keybindings.js` (`WindowKeybindings`): one
  `Main.wm.addKeybinding` per key of the schema in `schemas/`, registered
  `PER_WINDOW` so mutter hands the handler the focused window and skips it when
  there is none. A shortcut tiles to a position from `rules-format.js`, so a
  key, a rule and `wctl tile` cannot disagree about a rectangle; `cycle-wide`
  picks its position with `nextWidePosition` from the window's frame (within
  half a cell, so a terminal snapped to its character grid still counts), not
  from remembered state. A shortcut places through the `WindowPlacer`, as a
  rule does. `apply-rules` is the one
  shortcut without `PER_WINDOW`: it calls the service's `applyRulesToAll`, the
  `ApplyRules(0)` path without a D-Bus caller. The zip ships the schema
  XML only: every install path but a plain copy compiles it, and `build.sh
  install` compiles it for that one.
- **The preferences window** (`prefs.js`, `prefs/`) runs in its own process,
  not in GNOME Shell. It writes the schema keys and `rules.json`, and only
  lists the `rules.d` files; the
  extension only reads them. The Rules page validates with `rules-format.js`
  (through `prefs/rules-check.js`) and applies the rules with the
  `ApplyRules(0)` D-Bus call. `indicator.js` is the top-bar icon that the
  `show-indicator` key turns on; `extension.js` adds and removes it
  (`_syncIndicator`) and removes it while the screen is locked, as the
  shortcuts are.
- **The rules.json grammar** is `rules-format.js`, which imports
  **nothing**. `cli/src/rules.rs` is a second implementation of the same
  grammar, and both are pinned to `tests/vectors/rules-spec.json`
  ([0007](decisions/0007-the-rules-json-grammar-has-two-implementations-pinned-to-one-vector-file.md)).
  `docs/specs/RULES-JSON.md` is normative.
- `wctl` addresses windows through one **selector resolver** in two halves:
  `selector::parse_exact` / `parse_min` (pure: the selector and the argument
  count) and `selector::lookup(ctx, &selector)` (the bus: a numeric ID needs no
  D-Bus call, `focused` costs one `GetFocused`, and `-c/-t/-s/-p` cost one
  `ListDetailed` cached in `Ctx` for the command that follows).

## Finding things

```bash
# A D-Bus method's XML signature
grep -n 'method name=' window-control@carlo9890.github.io/dbus-interface.js

# A method's handler implementation
grep -nE 'MethodName(Async)?\(' window-control@carlo9890.github.io/dbus-service.js

# A wctl subcommand's implementation and its dispatch
grep -rn '"<name>" =>' cli/src/main.rs cli/src/commands/

# Every command wctl knows about
grep -n -A32 'pub const COMMANDS' cli/src/main.rs

# The pure helpers that are unit-tested headlessly
grep -n '^pub fn' cli/src/geometry.rs cli/src/selector.rs

# The method table users read (mirrors the XML above)
sed -n '/## Methods/,/## Errors/p' docs/user-guide/dbus.md
```

## Authoritative sources

- The D-Bus surface is the interface XML in
  `window-control@carlo9890.github.io/dbus-interface.js`. The method table in
  `docs/user-guide/dbus.md`
  mirrors it and is updated by hand, so trust the XML when they disagree.

## External resources

| Resource | URL |
|----------|-----|
| Releases | https://github.com/carlo9890/gnome-window-control/releases |
| Meta.Window API (mutter) | https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html |
| GJS D-Bus (`Gio.DBusExportedObject`) | https://gjs.guide/guides/gio/dbus.html |
| GNOME Shell extension porting notes | https://gjs.guide/extensions/ |
