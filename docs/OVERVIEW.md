# Overview

GNOME Shell extension that exposes a D-Bus interface for listing and controlling
windows on Wayland, plus `wctl`, a Rust CLI over that interface. Targets GNOME
Shell 45-50.

## Repository layout

```
window-control@carlo9890.github.io/   GNOME Shell extension (dir name == uuid)
├── extension.js           D-Bus service + method handlers (WindowControlService)
├── dbus-interface.js      D-Bus interface XML (imported by extension.js)
├── metadata.json          extension metadata (uuid, shell-version, url, version)
├── LICENSE                copy of the top-level LICENSE, shipped in the zip
└── README.md              packaged docs (shipped inside the release zip)
cli/                       wctl, the CLI (Rust, zbus)
├── Cargo.toml             crate manifest; its version gates the release
├── src/main.rs            argument dispatch, command inventory, help/version
├── src/dbus.rs            the D-Bus client (lazy session connection)
├── src/selector.rs        the <WINDOW> selector and the list filters
├── src/geometry.rs        place tokens, tile grid, centring
├── src/commands/          one module per command group
├── completions/           hand-written bash and zsh completions (embedded)
└── tests/cli.rs           argument-guard tests, run against the real binary
scripts/                   build.sh, release.sh, start-nested.sh, debug-dbus.sh
tests/                     test suites (see docs/TESTING.md)
docs/                      developer topic docs (this directory)
.github/workflows/         CI (build.yml)
dist/                      build output (generated zips)
install-wctl.sh            wctl installer
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
  `cli/tests/cli.rs` headless, and it is the CI gate.
- Window documents stay as `serde_json::Value` (with serde_json's
  `preserve_order`), because `list --json` and `info --json` must emit the
  extension's document unchanged, key order included.
- A single `extension.js` runs across GNOME 45-50 via runtime API detection for
  the maximize path (`get_maximized()` vs `get_maximize_flags()`).
- `WaitForWindow` is the one **async** handler (`WaitForWindowAsync(params,
  invocation)`, the GJS convention): it keeps the `Gio.DBusMethodInvocation` in
  `_waiters` and replies from a `window-created` handler or a `GLib.timeout_add`
  source. The display signal is connected only while a waiter is pending, and a
  new window is re-evaluated on `notify::wm-class` / `notify::title` (on
  Wayland those can arrive after creation) and on `shown`. A window only
  satisfies a waiter once it is shown (`_isUnshown`): before mutter maps and
  places it, any geometry request is overridden by the initial placement, so
  replying earlier would break the "launch, then place" script. `unexport()`
  fails every pending call and drops all handlers, so `disable()` leaves nothing
  behind.
- `wctl` addresses windows through one **selector resolver**
  (`selector::resolve(ctx, min_after, usage, args)` → id and shift): a numeric ID
  needs no D-Bus call, `focused` costs one `GetFocused`, and `-c/-t/-s/-p` cost
  one `ListDetailed` cached in `Ctx` for the command that follows. The
  argument-count check runs before any D-Bus call so usage errors stay headless.
  The pure halves (`selector::parse`, `select_id`, `filter`) are unit-tested.

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
