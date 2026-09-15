# Overview

GNOME Shell extension that exposes a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a Rust CLI over that interface. Targets GNOME
Shell 45-50.

## Repository layout

```
window-control@carlo9890.github.io/   GNOME Shell extension (dir name == uuid)
├── extension.js           D-Bus service + method handlers (WindowControlService)
├── dbus-interface.js      D-Bus interface XML (imported by extension.js)
├── rules.js               WindowRules: rules.json auto-placement (no D-Bus)
├── rules-format.js        the rules.json grammar; imports NOTHING (see below)
├── window-helpers.js      the GNOME 49 maximize API, shared by both
├── metadata.json          extension metadata (uuid, shell-version, url, version)
├── LICENSE                copy of the top-level LICENSE, shipped in the zip
└── README.md              packaged docs (shipped inside the release zip)
cli/                       wctl, the CLI (Rust, zbus)
├── Cargo.toml             crate manifest
├── src/main.rs            argument dispatch, command inventory, help/version
├── src/dbus.rs            the D-Bus client (lazy session connection)
├── src/selector.rs        the <WINDOW> selector and the list filters
├── src/geometry.rs        place tokens, tile grid, centring
├── src/rules.rs           the rules.json grammar, the Rust half of the pair
├── src/help.rs            usage and help text (a frozen contract)
├── src/commands/          one module per command group
├── completions/           hand-written bash and zsh completions (embedded)
└── tests/cli.rs           argument-guard tests, run against the real binary
scripts/                   build.sh, release.sh, start-nested.sh, debug-dbus.sh
tests/                     test suites (see docs/TESTING.md)
├── check-rules-format.js  headless gjs check of the rules.json grammar
└── vectors/               shared test vectors read by GJS and Rust alike
docs/                      developer topic docs (this directory)
.github/workflows/         CI (build.yml)
dist/                      build output (generated zips)
install-wctl.sh            wctl installer
README.md                  user docs; the D-Bus method table
gnome-window-control-extension-requirements.md   original design spec
```

## Architecture & key concepts

- The extension registers its D-Bus object on **GNOME Shell's own bus
  connection**, so the destination is `org.gnome.Shell` (not a standalone
  service). Path `/org/gnome/Shell/Extensions/WindowControl`, interface
  `org.gnome.Shell.Extensions.WindowControl`.
- `extension.js` holds one `WindowControlService` class; the simple boolean
  handlers share the `_actOnWindow(id, label, action)` helper. The interface XML
  lives in `dbus-interface.js` and is imported into `extension.js`.
- `wctl` speaks D-Bus directly through **zbus's blocking API** — no gdbus, no
  busctl, no jq, and no async runtime. It has no runtime dependencies at all: the
  release asset is a static musl binary. Failures funnel through
  `is_extension_not_running` in `dbus.rs` for a consistent hint.
- The session connection is opened **lazily**, so every argument-validation error
  is reported without touching the bus. That is what keeps the guard tests in
  `cli/tests/cli.rs` headless.
- Window documents stay as `serde_json::Value` (with serde_json's
  `preserve_order`), because `list --json` and `info --json` must emit the
  extension's document unchanged, key order included.
- A single `extension.js` runs across GNOME 45-50 via runtime API detection for
  the maximize path (`get_maximized()` vs `get_maximize_flags()`).
- `WaitForWindow` and `WaitForGeometry` are the **async** handlers (the GJS
  `...Async(params, invocation)` convention), holding the invocation in
  `_waiters` / `_geometryWatchers`. A window satisfies a waiter only once it is
  shown — `_isUnshown` and `_evaluateWindow` in `extension.js` say why, and
  `disable()` teardown is a release constraint in [RELEASING.md](RELEASING.md).
- **Auto-placement** lives in `rules.js` (`WindowRules`), separate from the D-Bus
  service: it reads `~/.config/gnome-window-control/rules.json`, watches
  `window-created`, and places a matching window once mutter has shown it. It
  makes no D-Bus call. The GNOME-49 maximize API detection is shared with
  `extension.js` through `window-helpers.js`. A geometry request only
  sticks after the window is shown (the same constraint `WaitForWindow` documents
  below), so a rule waits for `shown` and then applies from an idle callback; a
  window that maps maximized is unmaximized first.
- **The rules.json grammar** is `rules-format.js` — the one module that imports
  **nothing**, so plain `gjs` loads it without the mutter typelib and CI can
  check it. `cli/src/rules.rs` is a second implementation of the same grammar;
  both are pinned to `tests/vectors/rules-spec.json`, so neither drifts without
  the other's test failing. `docs/specs/RULES-JSON.md` is normative.
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
grep -n 'MethodName(' window-control@carlo9890.github.io/extension.js

# A wctl subcommand's implementation and its dispatch
grep -rn '"<name>" =>' cli/src/main.rs cli/src/commands/

# Every command wctl knows about
grep -n -A32 'pub const COMMANDS' cli/src/main.rs

# The pure helpers that are unit-tested headlessly
grep -n '^pub fn' cli/src/geometry.rs cli/src/selector.rs

# The method table users read (mirrors the XML above)
sed -n '/## Methods/,/## /p' README.md
```

## Authoritative sources

- The D-Bus surface is the interface XML in
  `window-control@carlo9890.github.io/dbus-interface.js`. The README method table
  mirrors it and is updated by hand, so trust the XML when they disagree.
- `gnome-window-control-extension-requirements.md` is the original design spec,
  kept as a record of intent. It is not tracked against the code and does not
  describe the current surface.

## External resources

| Resource | URL |
|----------|-----|
| Releases | https://github.com/carlo9890/gnome-window-control/releases |
| Meta.Window API (mutter) | https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html |
| GJS D-Bus (`Gio.DBusExportedObject`) | https://gjs.guide/guides/gio/dbus.html |
| GNOME Shell extension porting notes | https://gjs.guide/extensions/ |
